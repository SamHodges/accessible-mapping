//access token 
mapboxgl.accessToken = 'pk.eyJ1Ijoic2hvZGdlczIzIiwiYSI6ImNsODE0MjlibDAzcjgzb251c2lhb241NW4ifQ.MaT8KKreBHbWDZYCaAmSnQ';

// make a new map
const map = new mapboxgl.Map({

  container: 'map', //div id for where it's going
  // TODO: dark mode?
  style: 'mapbox://styles/mapbox/streets-v11', // color style for map
  center: [-72.516831266, 42.36916519], // starting position (Lat, long)
  zoom: 13 //zoom ratio- 0 is entire world, max is 24
});


// make directions box
const directions = new MapboxDirections({
  accessToken: mapboxgl.accessToken, //access token
  unit: 'metric', //metric for the win
  profile: 'mapbox/walking', //auto choose walking
  alternatives: 'false', //show alternatives 
  geometries: 'geojson'
});

// where directions box is on the map
map.addControl(directions, 'top-left');

//load barriers
const stairs = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [-72.51544,42.37144]
      },
      properties: {
        amount: 5
      }
    }
  ]
};

var alternatives = {};
alternatives["-72.51544,42.37144"] = [-72.515358, 42.371611];

// change into a turf object (unit is how far away we want to take into account avoidance)
const obstacle = turf.buffer(stairs, 0.005, { units: 'kilometers' });


// show obstacles on load
map.on('load', function(){
  map.addLayer({
    id: 'stairs',
    type: 'fill',
    source: {
      type: 'geojson',
      data: obstacle
    },
    layout: {},
    paint: {
      'fill-color': '#f03b20',
      'fill-opacity': 0.5,
      'fill-outline-color': '#f03b20'
    }
  });

  // get multiple routes back and show them
  for (let i = 0; i < 3; i++) {
    map.addSource(`route${i}`, {
      type: 'geojson',
      data: {
        type: 'Feature'
      }
    });

    map.addLayer({
      id: `route${i}`,
      type: 'line',
      source: `route${i}`,
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#cccccc',
        'line-opacity': 0.5,
        'line-width': 13,
        'line-blur': 0.5
      }
    })
  }
});



directions.on('route', (event) => {
  // get the little sidebar thing
  const reports = document.getElementById('reports');
  reports.innerHTML = '';
  const report = reports.appendChild(document.createElement('div'));
  // Add IDs to the routes
  const routes = event.route.map((route, index) => ({
    ...route,
    id: index
  }));

  // hide all the routes
  for (let i = 0; i < 3; i++) {
    map.setLayoutProperty(`route${i}`, 'visibility', 'none');
  }

  // keep track of if any of the routes are open
  numGoodRoutes = routes.length;

  // go through each route and make it visible, then do stuff with it
  for (const route of routes) {
    //make it visible!
    map.setLayoutProperty(`route${route.id}`, 'visibility', 'visible');

    // get coordinate data for it
    const routeLine = polyline.toGeoJSON(route.geometry);

    // update data/visual
    map.getSource(`route${route.id}`).setData(routeLine);

    // TODO: change this to multiple obstacles!
    // check to see if obstacle falls on route
    const isClear = turf.booleanDisjoint(obstacle, routeLine) === true;

    // if it does, we're 1 route down
    if (!isClear){numGoodRoutes = numGoodRoutes - 1};

    // if we're at 0 routes, time to add a waypoint
    if (numGoodRoutes == 0){
      // TODO: ADD WAYPOINT CALLS
      //addWaypoints(obstacle);
    }

    // make report depending if route is clear
    const collision = isClear ? 'is good!' : 'is bad.';
    const emoji = isClear ? '✔️' : '⚠️';
    const detail = isClear ? 'does not go' : 'goes';
    report.className = isClear ? 'item' : 'item warning';

    console.log("paint lines");
    if (isClear) {
      map.setPaintProperty(`route${route.id}`, 'line-color', '#74c476');
    } else {
      map.setPaintProperty(`route${route.id}`, 'line-color', '#de2d26');
    }

    // Add a new report section to the sidebar.
    console.log("report section");
    // Assign a unique `id` to the report.
    report.id = `report-${route.id}`;

    // Add the response to the individual report created above.
    const heading = report.appendChild(document.createElement('h3'));

    // Set the class type based on clear value.
    console.log("add report info");
    heading.className = isClear ? 'title' : 'warning';
    heading.innerHTML = `${emoji} Route ${route.id + 1} ${collision}`;

    // Add details to the individual report.
    const details = report.appendChild(document.createElement('div'));
    details.innerHTML = `This route ${detail} through an avoidance area.`;
    report.appendChild(document.createElement('hr'));
  }
});

// async function addWaypoints(){

// }