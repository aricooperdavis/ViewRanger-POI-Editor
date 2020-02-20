var loadBtn = document.getElementById('loadBtn');
var exportBtn = document.getElementById('exportBtn');

// ----------------- SQL: Setup --------------------------

function error(e) {
	/* If the SQL worker encounters errors then log them to the console */
	console.log(e);
};

function loadDb(e) {
	/* Get the SQL worker to load the datatable from the file */
	var f = loadBtn.files[0];
	var r = new FileReader();
	r.onload = function() {
		// When the datastream fully loads open a datatable using the result
		worker.postMessage({action: 'open', id: 'open', buffer: r.result});
	}
	r.readAsArrayBuffer(f)
};

function exportDb() {
	/* Send a message to the worker to apply current mods and fetch database */
	var poisToGo = [];
	for (var key in poiDict) {
		if (!poiDict[key]) {
			worker.postMessage({action: 'exec', id: 'exec',
				sql: 'DELETE FROM pois WHERE POI_ID='+key});
				poisToGo.push(key);
		};
	};
	worker.postMessage({action: 'export', id: 'export'});
	unplotPOIs(poisToGo);
};

function workerMessage(event) {
	/* Handle messages to the worker using the message id  */
	if (event.data.id == 'open') {
		// An open message should cause an SQL query to get the POIs
		worker.postMessage({action: 'exec', id: 'plot',
			sql: 'SELECT * FROM pois'});
	} else if (event.data.id == 'plot') {
		// A plot message should plot the result of an SQL query
		var valuesArray = event.data.results[0].values;
		plotPOIs(valuesArray);
	} else if (event.data.id == 'export') {
		// An export message downloads the database then clears the deleted points
		var arraybuff = event.data.buffer;
		var blob = new Blob([arraybuff]);
		var a = document.createElement("a");
		document.body.appendChild(a);
		a.href = window.URL.createObjectURL(blob);
		a.download = "sql.db";
		a.onclick = function () {
			setTimeout(function () {
				window.URL.revokeObjectURL(a.href);
			}, 1500);
		};
		a.click();
	};
};

// ----------------- SQL: Instance --------------------------

// SQL.js runs in this worker
var worker = new Worker("worker.sql-wasm.js");
worker.onerror = error;
worker.onmessage = workerMessage;

loadBtn.addEventListener("change", loadDb, true);
exportBtn.addEventListener("click", exportDb, true);

// ----------------- LEAFLET: Setup --------------------------

function plotPOIs(valuesArray) {
	/* Populate the dictionary of pois and plot them on the map */
	for (var i = 0; i < valuesArray.length; i++) {
		// Loop through and add to Leaflet map layer
		var marker = L.marker([valuesArray[i][7], valuesArray[i][8]],
			{title:valuesArray[i][2], uniqueID:valuesArray[i][3]});
		marker.on('click', togglePOI);
		marker.addTo(poiGroup);
		// Add marker to visibility reference dictionary default visible
		poiDict[marker.options.uniqueID] = true;
	};

	// Adjust map bounds to fit in markers
	map.fitBounds(poiGroup.getBounds());
};

function unplotPOIs(poisToGo) {
	// Given array of keys from poiDict unplot those POIs from the map
	layers = poiGroup.getLayers();
	for (var i = 0; i < layers.length; i++) {
		if (poisToGo.includes(layers[i].options.uniqueID.toString())) {
			poiGroup.removeLayer(layers[i]._leaflet_id);
		};
	};
	map.fitBounds(poiGroup.getBounds());
};

function togglePOI(e) {
	/* Toggle POI marker visibility */
	if (poiDict[e.target.options.uniqueID]) {
		e.target.setOpacity(0.5);
		poiDict[e.target.options.uniqueID] = false;
	} else {
		e.target.setOpacity(1);
		poiDict[e.target.options.uniqueID] = true;
	}
};

function boxToggle(bounds) {
	/* Toggle POIs within boxToggle selection box */
	for (var key in poiGroup._layers) {
		if (bounds.contains(poiGroup._layers[key]._latlng)) {
			// Wrap the layer as if it was the target of a click event
			togglePOI({'target': poiGroup._layers[key]});
		};
	};
};

// Add event listener that re-purposes the zoom box to toggle included markers
L.Map.BoxToggle = L.Map.BoxZoom.extend({
	_onMouseUp: function (e) {
		// This is copied direct from source-code, map/handler/Map.BoxZoom.js#L121
		if ((e.which !== 1) && (e.button !== 1)) { return; }

		this._finish();

		if (!this._moved) { return; }
		// Postpone to next JS tick so internal click event handling
		// still see it as "moved".
		this._clearDeferredResetState();
		this._resetStateTimeout = setTimeout(L.bind(this._resetState, this), 0);

		var bounds = new L.LatLngBounds(
	    this._map.containerPointToLatLng(this._startPoint),
	    this._map.containerPointToLatLng(this._point));

		// Here we remove the .fitBounds call and do our own stuff instead
		boxToggle(bounds);

		this._map.fire('boxzoomend', {boxZoomBounds: bounds});
	}
});

L.Map.mergeOptions({boxZoom: false}); // Disable box-zoom
L.Map.mergeOptions({boxToggle: true}); // Enable our extended box-zoom method
L.Map.addInitHook('addHandler', 'boxToggle', L.Map.BoxToggle); // Hook handler

// ----------------- LEAFLET: Instance --------------------------

// Generate the map and layers
var map = L.map('mapid').setView([51.505, -0.09], 2);
// poiGroup is a featureGroup that will display markers on the map
var poiGroup = new L.featureGroup().addTo(map);
// poiDict is a dictionary of whether those markers should be visible
var poiDict = {};

L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}', {
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
    maxZoom: 18,
    id: 'mapbox/streets-v11',
    tileSize: 512,
    zoomOffset: -1,
    accessToken: 'pk.eyJ1IjoiYXJpY29vcGVyZGF2aXMiLCJhIjoiY2p4YnBvc3Z3MDBodjQydGw3cHNmNWxycSJ9.IuUoWUeuAqVz4bSos8gOqA'
}).addTo(map);
