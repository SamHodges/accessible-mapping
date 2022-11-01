//access token 
mapboxgl.accessToken = 'pk.eyJ1Ijoic2hvZGdlczIzIiwiYSI6ImNsODE0MjlibDAzcjgzb251c2lhb241NW4ifQ.MaT8KKreBHbWDZYCaAmSnQ';

// make a new map
const map = new mapboxgl.Map({

  container: 'map', //div id for where it's going
  // TODO: dark mode?
  style: 'mapbox://styles/mapbox/streets-v11', // color style for map
  center: [-72.516831266, 42.36916519], // center position (Lat, long)
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
const stairs_keefe_hill = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [-72.51544,42.37142]
      },
      properties: {
        steepness: 60,
        stairs: 100,
        uneven: 0,
        noise: 30,
        id: "stairs_keefe_hill",
        barrier_type: "stairs",
        alternatives: [-72.51544,42.37156]
      }
    }
  ]
};

const steep_hill_keefe = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [-72.51544,42.37156]
      },
      properties: {
        amount: 5,
        id: "steep_hill_keefe",
        barrier_type: "steep",
        alternatives: [-72.51544,42.37142]
      }
    }
  ]
};

barriers = [stairs_keefe_hill];//, steep_hill_keefe];
map_layers = [];

// change into a turf object (unit is how far away we want to take into account avoidance)
obstacles = [];
for (i=0; i<barriers.length; i++){
  current_obstacle = turf.buffer(barriers[i], 0.005, { units: 'kilometers' });
  obstacles.push(current_obstacle);
}

var routeLine; 

// show obstacles on load
map.on('load', function(){
  for (i=0; i<barriers.length; i++){
    map_layers.push(barriers[i]["features"][0]["properties"]["id"]); 

    console.log(barriers[i]["features"][0]);
    map.addLayer({
      id: barriers[i]["features"][0]["properties"]["id"],
      type: 'fill',
      source: {
        type: 'geojson',
        data: obstacles[i]
      },
      layout: {},
      paint: {
        'fill-color': '#f03b20',
        'fill-opacity': 0.5,
        'fill-outline-color': '#f03b20'
      }
    });
  }

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
  // const reports = document.getElementById('reports');
  // reports.innerHTML = '';
  // const report = reports.appendChild(document.createElement('div'));
  // // Add IDs to the routes
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
    routeLine = polyline.toGeoJSON(route.geometry);

    // update data/visual
    map.getSource(`route${route.id}`).setData(routeLine);

    // check to see if obstacle falls on route
    isClear = true;
    issue_points = [];
    for (i=0; i<obstacles.length; i++){
      if (turf.booleanDisjoint(obstacles[i], routeLine) === false){
        isClear = false;
        issue_points.push(i);
      }
    }

    // if it does, we're 1 route down
    if (!isClear){numGoodRoutes = numGoodRoutes - 1};

    // if we're at 0 routes, time to add a waypoint
    if (numGoodRoutes == 0){
      addWaypoints(issue_points);
    }

    console.log("paint lines");
    if (isClear) {
      map.setPaintProperty(`route${route.id}`, 'line-color', '#74c476');
    } else {
      map.setPaintProperty(`route${route.id}`, 'line-color', '#000000');
    }
  }
});

async function addWaypoints(issue_points){
  const query = await fetch(makeURL(issue_points), {method: 'GET'});
  const response = await query.json();

  if (response.code !== 'Ok') {
    const handleMessage =
      response.code === 'InvalidInput'
        ? 'Refresh to start a new route. For more information: https://docs.mapbox.com/api/navigation/optimization/#optimization-api-errors'
        : 'Try a different point.';
    alert(`${response.code} - ${response.message}\n\n${handleMessage}`);
  }
  
  for (i=0; i<response["waypoints"].length; i++){
    waypoint = response["waypoints"][i]["location"];
    // directions.addWaypoint(i, waypoint);
  }

}


function makeURL(issue_points){
  coordinate_list = [];

  //push first coordinate
  coordinate_list.push(routeLine["coordinates"][0]);

  //go through barriers and add alternative routes
  for (i=0; i<issue_points.length; i++){
    current_barrier = barriers[issue_points[i]];
    waypoint = current_barrier["features"][0]["properties"]["alternatives"]
    coordinate_list.push(waypoint);
    directions.addWaypoint(i, waypoint);
  }

  // add end barrier
  coordinate_list.push(routeLine["coordinates"][routeLine["coordinates"].length -1]);

  return `https://api.mapbox.com/optimized-trips/v1/mapbox/walking/${coordinate_list.join(';'
          )}?overview=full&steps=true&geometries=geojson&source=first&destination=last&roundtrip=false&access_token=${mapboxgl.accessToken}`;
        }


//sliders
// connect to sliders
var steepnessSlider = document.getElementById("steepness-slider");
var stairsSlider = document.getElementById("stairs-slider");
var unevenSlider = document.getElementById("uneven-slider");
var noiseSlider = document.getElementById("noise-slider");

// set initial values
var steepnessValue = steepnessSlider.value;
var stairsValue = stairsSlider.value;
var unevenValue = unevenSlider.value;
var noiseValue = noiseSlider.value;


// keep track of values
steepnessSlider.oninput = function() {
  steepnessValue = steepnessSlider.value;
  recalculateBarriers();
} 

stairsSlider.oninput = function() {
  stairsValue = stairsSlider.value;
  recalculateBarriers();
} 

unevenSlider.oninput = function() {
  unevenValue = unevenSlider.value;
  recalculateBarriers();
} 

noiseSlider.oninput = function() {
  noiseValue = noiseSlider.value;
  recalculateBarriers();
} 


var customMode = document.getElementById("custom-mode");
var wheelchairMode = document.getElementById("wheelchair-mode");
var caneMode = document.getElementById("cane-mode");

// buttons for modes
customMode.onclick = function customMode(){
  document.getElementById("custom-mode").setAttribute("class", "w3-button w3-blue-grey w3-round-xlarge w3-small"); 
  document.getElementById("wheelchair-mode").setAttribute("class", "w3-button w3-indigo w3-round-xlarge w3-small"); 
  document.getElementById("cane-mode").setAttribute("class", "w3-button w3-indigo w3-round-xlarge w3-small"); 
  
  steepnessSlider.value = 50;
  stairsSlider.value = 50;
  unevenSlider.value = 50;
  noiseSlider.value = 50;
  recalculateBarriers();
}

wheelchairMode.onclick = function wheelchairMode(){
  document.getElementById("custom-mode").setAttribute("class", "w3-button w3-indigo w3-round-xlarge w3-small"); 
  document.getElementById("wheelchair-mode").setAttribute("class", "w3-button w3-blue-grey w3-round-xlarge w3-small"); 
  document.getElementById("cane-mode").setAttribute("class", "w3-button w3-indigo w3-round-xlarge w3-small"); 

  steepnessSlider.value = 40;
  stairsSlider.value = 0;
  unevenSlider.value = 20;
  noiseSlider.value = 50;
  recalculateBarriers();
}

caneMode.onclick = function caneMode(){
  document.getElementById("custom-mode").setAttribute("class", "w3-button w3-indigo w3-round-xlarge w3-small"); 
  document.getElementById("wheelchair-mode").setAttribute("class", "w3-button w3-indigo w3-round-xlarge w3-small"); 
  document.getElementById("cane-mode").setAttribute("class", "w3-button w3-blue-grey w3-round-xlarge w3-small"); 
  
  steepnessSlider.value = 40;
  stairsSlider.value = 10;
  unevenSlider.value = 30;
  noiseSlider.value = 50;
  recalculateBarriers();
}

function recalculateBarriers(){
  // change into a turf object (unit is how far away we want to take into account avoidance)
  current_mode_barriers =[];
  for (i=0; i<barriers.length; i++){
    if(barriers[i]["features"][0]["properties"]["steepness"] > steepnessValue || 
      barriers[i]["features"][0]["properties"]["stairs"] > stairsValue ||
      barriers[i]["features"][0]["properties"]["uneven"] > unevenValue ||
      barriers[i]["features"][0]["properties"]["noise"] > noiseValue){
    current_mode_barriers.push(barriers[i]);
  }
  }

   for (i=0; i<map_layers.length; i++){
      map.setLayoutProperty(map_layers[i], 'visibility', 'none');
    }

    for (i=0; i<current_mode_barriers.length; i++){
      map.setLayoutProperty(current_mode_barriers[i]["features"][0]["properties"]["id"], 'visibility', 'visible');
    }
  }