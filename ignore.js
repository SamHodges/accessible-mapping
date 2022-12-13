// access online map info
mapboxgl.accessToken = 'pk.eyJ1Ijoic2hvZGdlczIzIiwiYSI6ImNsODE0MjlibDAzcjgzb251c2lhb241NW4ifQ.MaT8KKreBHbWDZYCaAmSnQ';

// make a new map
const map = new mapboxgl.Map({
  container: 'map', //div id for where it's going
  style: 'mapbox://styles/shodges23/claa6b8tx001816qvoj809eho', // color style for map
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

// keep track of what's an issue for the current user
current_mode_obstacles = [];
current_mode_barriers =[];
issue_points = [];

// keep track of what stage we are in the request from user (recieved, processing, done)
newRequest = true; 
addedWaypoints = false;


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

    map.addLayer({
      id: barriers[i]["features"][0]["properties"]["id"],
      type: 'fill',
      source: {
        type: 'geojson',
        data: obstacles[i]
      },
      layout: {
        // 'visibility' : 'visible',
      },
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


currentBuilding = null;
currentFloors = null;
const popup = new mapboxgl.Popup();

/* 
Add an event listener that runs
  when a user clicks on the map element.
*/
map.on('click', (event) => {
  // If the user clicked on one of your markers, get its information.
  const features = map.queryRenderedFeatures(event.point, {
    layers: ['buildingaccessibilitylabels'] // replace with your layer name
  });

  if (!features.length) {
    console.log("features = 0");
    return;
  }
  const feature = features[0];

  /* 
    Create a popup, specify its options 
    and properties, and add it to the map.
  */

currentFloors = feature.properties.stairs_general;
console.log(currentFloors);
currentBuilding = feature.properties.title;
  popup.setLngLat(feature.geometry.coordinates)
  .setMaxWidth("none")
  .setHTML(
    `<h3>${feature.properties.title}</h3>
    <span style="float:left">
    <p class = "popup-rating">Stairs: ${feature.properties.stairs_general}/3</p>
    <p class = "popup-rating">Door buttons: ${feature.properties.doors_general}/3</p>
    <p class = "popup-rating">Resting Areas: ${feature.properties.resting_general}/3</p> 
    <p class = "popup-rating">Elevator Access: ${feature.properties.elevators_general}/3</p>
    <p class = "popup-rating">Noise: ${feature.properties.noise_general}/3</p>
    <hr>
    <p class = "popup-rating">Notes: </p>
    <p class = "popup-rating">Can get busy during lunch periods.</p>
    </span>
    <span style = "float:right">
    <p><img style="padding:10px" width=250px src="${feature.properties.title}-1.png" alt="first floor map"></p>
    <p style="text-align: center;"><button class="w3-button w3-indigo w3-round-xlarge w3-small" onclick="fullFloorPlan()">Full Floor Plan</button></p>
    </span>
    `
  )
  .addTo(map);

});



directions.on('route', (event) => {
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
    recalculateBarriers();

    // if it does, we're 1 route down
    // if (!isClear){numGoodRoutes = numGoodRoutes - 1};

    // if we're at 0 routes, time to add a waypoint
    // if (numGoodRoutes == 0){
    if (issue_points.length > 0 && addedWaypoints == false){
      addWaypoints(issue_points);
    }

    addedWaypoints = true;


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
}


function makeURL(issue_points){
  coordinate_list = [];

  //push first coordinate
  coordinate_list.push(routeLine["coordinates"][0]);

  if(issue_points.length == 0){
    newRequest = true;
  }
  else{
  }

  //go through barriers and add alternative routes
  for (i=0; i<issue_points.length; i++){
    current_barrier = current_mode_barriers[issue_points[i]];
    waypoint = current_barrier["features"][0]["properties"]["alternatives"]
    coordinate_list.push(waypoint);
    directions.addWaypoint(i, waypoint);
  }



  // add end barrier
  coordinate_list.push(routeLine["coordinates"][routeLine["coordinates"].length -1]);

  url = `https://api.mapbox.com/optimized-trips/v1/mapbox/walking/${coordinate_list.join(';'
          )}?overview=full&steps=true&geometries=geojson&source=first&destination=last&roundtrip=false&access_token=${mapboxgl.accessToken}`;
        
  return url;
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
  newRequest = true;
  addedWaypoints = false;
  recalculateBarriers();
} 

stairsSlider.oninput = function() {
  stairsValue = stairsSlider.value;
  newRequest = true;
  addedWaypoints = false;
  recalculateBarriers();
} 

unevenSlider.oninput = function() {
  unevenValue = unevenSlider.value;
  newRequest = true;
  addedWaypoints = false;
  recalculateBarriers();
} 

noiseSlider.oninput = function() {
  noiseValue = noiseSlider.value;
  newRequest = true;
  addedWaypoints = false;
  recalculateBarriers();
} 


var customMode = document.getElementById("custom-mode");
var wheelchairMode = document.getElementById("wheelchair-mode");
var caneMode = document.getElementById("cane-mode");

// buttons for modes
customMode.onclick = function customMode(){
  newRequest = true;
  addedWaypoints = false;
  document.getElementById("custom-mode").setAttribute("class", "w3-button w3-blue-grey w3-round-xlarge w3-small"); 
  document.getElementById("wheelchair-mode").setAttribute("class", "w3-button w3-indigo w3-round-xlarge w3-small"); 
  document.getElementById("cane-mode").setAttribute("class", "w3-button w3-indigo w3-round-xlarge w3-small"); 
  
  steepnessValue = 50;
  stairsValue = 50;
  unevenValue = 50;
  noiseValue = 50;

  steepnessSlider.value = 50;
  stairsSlider.value = 50;
  unevenSlider.value = 50;
  noiseSlider.value = 50;
  recalculateBarriers();
}

wheelchairMode.onclick = function wheelchairMode(){
  newRequest = true;
  addedWaypoints = false;
  document.getElementById("custom-mode").setAttribute("class", "w3-button w3-indigo w3-round-xlarge w3-small"); 
  document.getElementById("wheelchair-mode").setAttribute("class", "w3-button w3-blue-grey w3-round-xlarge w3-small"); 
  document.getElementById("cane-mode").setAttribute("class", "w3-button w3-indigo w3-round-xlarge w3-small"); 

  steepnessValue = 40;
  stairsValue = 0;
  unevenValue = 20;
  noiseValue = 50;

  steepnessSlider.value = 40;
  stairsSlider.value = 0;
  unevenSlider.value = 20;
  noiseSlider.value = 50;
  recalculateBarriers();
}

caneMode.onclick = function caneMode(){
  newRequest = true;
  addedWaypoints = false;
  document.getElementById("custom-mode").setAttribute("class", "w3-button w3-indigo w3-round-xlarge w3-small"); 
  document.getElementById("wheelchair-mode").setAttribute("class", "w3-button w3-indigo w3-round-xlarge w3-small"); 
  document.getElementById("cane-mode").setAttribute("class", "w3-button w3-blue-grey w3-round-xlarge w3-small"); 
  
  steepnessValue = 40;
  stairsValue = 10;
  unevenValue = 30;
  noiseValue = 50;

  steepnessSlider.value = 40;
  stairsSlider.value = 10;
  unevenSlider.value = 30;
  noiseSlider.value = 50;
  recalculateBarriers();
}

function recalculateBarriers(){
  current_mode_barriers = [];
  // change into a turf object (unit is how far away we want to take into account avoidance)
  for (i=0; i<barriers.length; i++){
    if(barriers[i]["features"][0]["properties"]["steepness"] > steepnessValue || 
      barriers[i]["features"][0]["properties"]["stairs"] > stairsValue ||
      barriers[i]["features"][0]["properties"]["uneven"] > unevenValue ||
      barriers[i]["features"][0]["properties"]["noise"] > noiseValue){
    current_mode_barriers.push(barriers[i]);
    }
  }

    current_mode_obstacles = [];

    for (i=0; i<current_mode_barriers.length; i++){
      map.setLayoutProperty(current_mode_barriers[i]["features"][0]["properties"]["id"], 'visibility', 'visible');
      current_obstacle = turf.buffer(current_mode_barriers[i], 0.005, { units: 'kilometers' });
      current_mode_obstacles.push(current_obstacle);
    }

    if (routeLine !== undefined && newRequest){
      recalculateDirections();
    }
  }

  function recalculateDirections(){
    for (i=issue_points.length-1; i>=0; i--){
      issue_points = issue_points.pop();
      directions.removeWaypoint(i);
    }

    if (issue_points.length === undefined){
      issue_points = [];
    }

    for (i=0; i<current_mode_obstacles.length; i++){
      if (turf.booleanDisjoint(current_mode_obstacles[i], routeLine) === false){
        isClear = false;
        issue_points.push(i);
      }
    }

    newRequest = false;
    addWaypoints(issue_points);


  }




function fullFloorPlan(){
  console.log("hi!");
  window.location.href = 'floor_plan.html#' + currentBuilding.replace(/ /g,"_") + "#" + currentFloors;
}
