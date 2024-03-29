/*
Current issues:
- nearest parking lot and rest areas don't work-- set opacity to 0, but how do rest of lines even display lmao?
*/

// -----------------------------------------Initialize Map-----------------------------------------------
//access token to access map + routing
mapboxgl.accessToken = 'pk.eyJ1Ijoic2hvZGdlczIzIiwiYSI6ImNsODE0MjlibDAzcjgzb251c2lhb241NW4ifQ.MaT8KKreBHbWDZYCaAmSnQ';

// make a new map
const map = new mapboxgl.Map({
  container: 'map', //div id for where it's going
  style: 'mapbox://styles/shodges23/claa6b8tx001816qvoj809eho', // color style for map
  center: [-72.51706,42.37097], // center position (Lat, long)
  zoom: 16 //zoom ratio- 0 is entire world, max is 24
});

// -----------------------------------------Initialize Directions-----------------------------------------------
// make directions box
const directions = new MapboxDirections({
  accessToken: mapboxgl.accessToken, //access token
  unit: 'metric', //metric for the win
  profile: 'mapbox/walking', //auto choose walking
  alternatives: 'false', //show alternatives 
  geometries: 'geojson', //how it sends info
  bbox: '-72.51987,42.36841,-72.51140,42.37573'
});

// where directions box is on the map
map.addControl(directions, 'top-left');

// -----------------------------------------Rest Areas-----------------------------------------------
// get coordinates of rest areas
const restAreaCoordinates = JSON.parse(all_data)["restAreaCoordinates"];

// go through and add them to map
for (i=0; i<restAreaCoordinates.length; i++){
  let currentElement = document.createElement('div'); // create an element
  currentElement.className = 'rest-area'; // assign it to class (for formatting)
  new mapboxgl.Marker(currentElement).setLngLat(restAreaCoordinates[i]["geometry"]["coordinates"]).addTo(map); //add to map
}

// -----------------------------------------Parking Lots-----------------------------------------------
// get coordinates of parking lots
const parkingLots = JSON.parse(all_data)["parkingLots"];

// go through and add to map
for (i=0; i<parkingLots.length; i++){
  let currentElement = document.createElement('div'); // create element for it
  currentElement.className = 'parking-lot'; // assign class for formatting
  new mapboxgl.Marker(currentElement).setLngLat(parkingLots[i]["geometry"]["coordinates"]).addTo(map); // add to map
}

// -----------------------------------------Initialize Barriers-----------------------------------------------
let issue_points = []; // barriers included in current route
let newRequest = true; // whether a directions request has been made
let addedWaypoints = false; // whether waypoints have been added to the route yet
let routeLine; // the current route

// get coordinates for barriers
let barriers = JSON.parse(all_data)["barriers"];

// -----------------------------------------Building Pop Up-----------------------------------------------
// initialize variables for building popups
let currentBuilding = null; // current building user clicked
let currentFloors = null; // amount of floors in that building
let popup = new mapboxgl.Popup(); // add empty popup to map
let currentStart = null; // where the user currently is/where they clicked


// TODO: organize where these go! ------------------------------------------------------------

function convertToTurf(barrier){
  return turf.buffer(barrier, 0.005, { units: 'kilometers' }); // change to turf object
}


function getBarrierID(barrier){
  return barrier["properties"]["id"];
}

// -----------------------------------------Load Map-----------------------------------------------
map.on('load', function(){
  // go through barriers and add them to map
  for (i=0; i<barriers.length; i++){

    // add barriers to the map layer so they can appear/be incorporated to routes
    map.addLayer({
      id: getBarrierID(barriers[i]),
      type: 'fill',
      source: {
        type: 'geojson',
        data: convertToTurf(barriers[i]),
      },
      layout: {},
      paint: {
        'fill-color': '#f03b20',
        'fill-opacity': 0.5,
        'fill-outline-color': '#f03b20'
      }
    });
  }

  //calculate original barriers
  recalculateBarriers();

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
        'line-opacity': 0,
        'line-width': 13,
        'line-blur': 0.5
      }
    })
  }
});

// -----------------------------------------Map User Click-----------------------------------------------
map.on('click', (event) => {
  // save where the user says they are
  currentStart = [event.lngLat["lng"], event.lngLat["lat"]];

  // check to see if the user clicked a building
  const features = map.queryRenderedFeatures(event.point, {
    layers: ['buildingaccessibilitylabels'] // layer I put building info into
  });

  // if the user didn't click a building, stop here
  if (!features.length) { // no features = no building info where clicked
    return;
  }
  const feature = features[0];

  // create popup for current building
  currentFloors = feature.properties.floors; // set amount of floors to current building
  currentBuilding = feature.properties.title; // set name of building to current building
  popup.setLngLat(feature.geometry.coordinates) // popup where the building is
  .setMaxWidth("none") // as big as it wants
  // set info for popup for current building
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
  .addTo(map); // add to map
});


// -----------------------------------------Making Routes-----------------------------------------------
directions.on('route', (event) => {
  // get routes back from mapping software
  const routes = event.route.map((route, index) => ({
    ...route,
    id: index
  }))[0];

  // keep track of if any of the routes are open
  numGoodRoutes = routes.length;

  // get coordinate data for it
  routeLine = polyline.toGeoJSON(routes.geometry);

  // check to see if obstacle falls on route
  recalculateBarriers();

  addedWaypoints = true; // keep track of adding the waypoints
});


// adding the waypoints to the route
async function addWaypoints(issuePoints, currentBarriers){
  // send in request for new route with waypoints
  const query = await fetch(makeURL(issuePoints, currentBarriers), {method: 'GET'}); // make and send request
  const response = await query.json(); // wait for response

  // if response is good, done! if not, give error
  if (response.code !== 'Ok') {
    const handleMessage =
      response.code === 'InvalidInput'
        ? 'Refresh to start a new route. For more information: https://docs.mapbox.com/api/navigation/optimization/#optimization-api-errors'
        : 'Try a different point.';
    alert(`${response.code} - ${response.message}\n\n${handleMessage}`);
  }
}

// make url for adding waypoints
function makeURL(issuePoints, currentBarriers){
  // make a list of all the coordinates
  coordinate_list = [];

  //push first coordinate
  coordinate_list.push(routeLine["coordinates"][0]);

  if(issuePoints.length == 0){
    newRequest = true;
  }

  //go through barriers and add alternative routes
  for (i=0; i<issuePoints.length; i++){
    currentBarrier = currentBarriers[issuePoints[i]]; // get current barrier from list of current user barriers
    waypoint = currentBarrier["properties"]["alternatives"]; // look at alternative it needs
    coordinate_list.push(waypoint); // add it to the list of coordinates to pass through
    directions.addWaypoint(i, waypoint); // add it to the routing text directions
  }

  // add end barrier
  coordinate_list.push(routeLine["coordinates"][routeLine["coordinates"].length -1]);


  // make url of new coordinates
  url = `https://api.mapbox.com/optimized-trips/v1/mapbox/walking/${coordinate_list.join(';'
          )}?overview=full&steps=true&geometries=geojson&source=first&destination=last&roundtrip=false&access_token=${mapboxgl.accessToken}`;
        
  // return url
  return url;
}


// -----------------------------------------Sliders-----------------------------------------------
// connect to sliders from HTML
const steepnessSlider = document.getElementById("steepness-slider");
const stairsSlider = document.getElementById("stairs-slider");
const unevenSlider = document.getElementById("uneven-slider");
const noiseSlider = document.getElementById("noise-slider");

// set initial values
let steepnessValue = steepnessSlider.value;
let stairsValue = stairsSlider.value;
let unevenValue = unevenSlider.value;
let noiseValue = noiseSlider.value;


// keep track of values when the sliders change
steepnessSlider.oninput = function() {
  steepnessValue = steepnessSlider.value; // get value
  newRequest = true; // need to reroute
  addedWaypoints = false; // haven't added waypoints for this barrier level
  recalculateBarriers(); // recalc everything
} 

// repeat for other sliders
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

// -----------------------------------------Modes-----------------------------------------------
// get modes from HTML
const customMode = document.getElementById("custom-mode");
const wheelchairMode = document.getElementById("wheelchair-mode");
const caneMode = document.getElementById("cane-mode");

// redo barrier levels when buttons clicked
customMode.onclick = function customMode(){
  newRequest = true; // haven't done route for this barrier level
  addedWaypoints = false; // haven't calculated waypoints for these barriers

  // change button colors
  document.getElementById("custom-mode").setAttribute("class", "w3-button w3-blue-grey w3-round-xlarge w3-xlarge"); 
  document.getElementById("wheelchair-mode").setAttribute("class", "w3-button w3-indigo w3-round-xlarge w3-xlarge"); 
  document.getElementById("cane-mode").setAttribute("class", "w3-button w3-indigo w3-round-xlarge w3-xlarge"); 
  
  // change barrier levels JS side
  steepnessValue = 50;
  stairsValue = 50;
  unevenValue = 50;
  noiseValue = 50;

  // change barrier levels HTML side
  steepnessSlider.value = 50;
  stairsSlider.value = 50;
  unevenSlider.value = 50;
  noiseSlider.value = 50;

  // recalc everything
  recalculateBarriers();
}

// repeat for other modes
wheelchairMode.onclick = function wheelchairMode(){
  newRequest = true;
  addedWaypoints = false;
  document.getElementById("custom-mode").setAttribute("class", "w3-button w3-indigo w3-round-xlarge w3-xlarge"); 
  document.getElementById("wheelchair-mode").setAttribute("class", "w3-button w3-blue-grey w3-round-xlarge w3-xlarge"); 
  document.getElementById("cane-mode").setAttribute("class", "w3-button w3-indigo w3-round-xlarge w3-xlarge"); 

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
  document.getElementById("custom-mode").setAttribute("class", "w3-button w3-indigo w3-round-xlarge w3-xlarge"); 
  document.getElementById("wheelchair-mode").setAttribute("class", "w3-button w3-indigo w3-round-xlarge w3-xlarge"); 
  document.getElementById("cane-mode").setAttribute("class", "w3-button w3-blue-grey w3-round-xlarge w3-xlarge"); 
  
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

// -----------------------------------------Recalculating Barriers-----------------------------------------------
function recalculateBarriers(){
    let currentBarriers = []; // keep track of barriers for this user

    // go through possible barriers and check if they're barriers for current user
    for (i=0; i<barriers.length; i++){
      if(barriers[i]["properties"]["steepness"] > steepnessValue || 
        barriers[i]["properties"]["stairs"] > stairsValue ||
        barriers[i]["properties"]["uneven"] > unevenValue ||
        barriers[i]["properties"]["noise"] > noiseValue){
      currentBarriers.push(barriers[i]); // if they are, add to barrier list
      }
    }

    // make all barriers invisible on map
    for (i=0; i<barriers.length; i++){
      map.setLayoutProperty(getBarrierID(barriers[i]), 'visibility', 'none');
    }

    // go through barriers and make them turf objects + visible on map
    for (i=0; i<currentBarriers.length; i++){
      map.setLayoutProperty(getBarrierID(currentBarriers[i]), 'visibility', 'visible'); // make barriers visible on map
    }

    // recalculate based on current route (ie, it calcs a route, check for barriers, recalc route)
    if (routeLine !== undefined && newRequest){
      recalculateDirections(currentBarriers);
    }
  }

  // recalc a route
  function recalculateDirections(currentBarriers){
    // remove all existing issue points (from past requests)
    for (i=issue_points.length-1; i>=0; i--){
      issue_points = issue_points.pop(); // take them off issue point list
      directions.removeWaypoint(i); // remove from map routing
    }

    // set issue points back to empty array
    if (issue_points.length === undefined){
      issue_points = [];
    }

    // check to see if current obstacles are on the route
    for (i=0; i<currentBarriers.length; i++){
      if (turf.booleanDisjoint(convertToTurf(currentBarriers[i]), routeLine) === false){ // checks if they're on the route
        issue_points.push(i); // adds them back into issue points
      }
    }

    // make a note of start/end spaces
    const end_spots = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: routeLine["coordinates"][0]
          },
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: routeLine["coordinates"][routeLine["coordinates"].length-1]
          },
        }
      ]
    };

    // turn end spots into turf objects
    const end_spot = turf.buffer(end_spots, 0.005, { units: 'kilometers' });

    // warn users if end spots aren't accessible
    for (i=0; i<currentBarriers.length; i++){
      if (turf.booleanDisjoint(convertToTurf(currentBarriers[i]), end_spot) === false){ // check if it's on a barrier
        const warning = new mapboxgl.Popup(); // if yes, make a popup
        popup.setLngLat(currentBarriers[i]["geometry"]["coordinates"]) // popup at barrier
            .setMaxWidth("none")
            // warn user it's not accessible
            .setHTML(
              `<h1 style="text-align: center;">Warning</h1>
              <h3>The route you have chosen starts or stops on one of your barriers. </h3>
              `
            )
            .addTo(map); // add to map
        }
      }

    newRequest = false; // request has been fulfilled
    addWaypoints(issue_points, currentBarriers); // add waypoints on any issue points
  }



// ------------------------------------------In Depth Floor Plans----------------------------------------------
function fullFloorPlan(){
  window.location.href = 'floor_plan.html#' + currentBuilding.replace(/ /g,"_") + "#" + currentFloors; // open floor plan
}

// ------------------------------------------Recenter----------------------------------------------
function recenter(){
  map.flyTo({center: [-72.51706,42.37097], zoom: 16}); // recenter back to amherst when button clicked
}

// ------------------------------------------Nearest Parking----------------------------------------------
async function parking(){
  // initialize distance and directions
  let shortestDistance = Number.MAX_VALUE;
  let parkingLotDirections = null;

  // if user hasn't clicked map, ask them where they are
  if(currentStart === null){
    const enterStart = new mapboxgl.Popup(); // new popup
        popup.setLngLat(map.getCenter()) // pops up in center of map
            .setMaxWidth("none")
            .setHTML(
              `<h1 style="text-align: center;">Remember to Enter Your Current Position!</h1>
              `
            ) // reminder text
            .addTo(map); // add to map
  }


  // go through all lots and find the closest
  for (i=0; i<parkingLots.length; i++){
    coordinate_list = [currentStart, parkingLots[i]["geometry"]["coordinates"]]; // put user position and lot in a list
    // make url to ask for route
    url = `https://api.mapbox.com/optimized-trips/v1/mapbox/walking/${coordinate_list.join(';'
            )}?overview=full&steps=true&geometries=geojson&source=first&destination=last&roundtrip=false&access_token=${mapboxgl.accessToken}`;
          

    // ask for route
    const query = await fetch(url, {method: 'GET'});
    const response = await query.json();

    // get distance of route
    currentDistance = response.trips[0].distance;

    // if shortest distance, replace everything
    if (currentDistance < shortestDistance){
      shortestDistance = currentDistance; // reset shortest distance
      parkingLotDirections = response; // reset lot directions
    } 
  }

  // update data/visual
  const routeGeoJSON = turf.featureCollection([
  turf.feature(parkingLotDirections.trips[0].geometry)]); // make into turf object
  map.getSource(`route0`).setData(routeGeoJSON); // set route data to url data
  map.setPaintProperty("route0", "line-color", "#74c476"); // color the route
  map.setPaintProperty("route0", "line-opacity", 1.0); // color the route
}

// ------------------------------------------Nearest Rest Areas----------------------------------------------
async function resting(){
  // initialize distance and directions
  shortestDistance = Number.MAX_VALUE;
  restingDirections = null;

  // if user hasn't put in position, remind them
  if(currentStart === null){
    const enterStart = new mapboxgl.Popup();
        popup.setLngLat(map.getCenter())
            .setMaxWidth("none")
            .setHTML(
              `<h1 style="text-align: center;">Remember to Enter Your Current Position!</h1>`)
            .addTo(map);
  }

  // go through to find closest resting area
  for (i=0; i<restAreaCoordinates.length; i++){
    // make route ask
    coordinate_list = [currentStart, restAreaCoordinates[i]["geometry"]["coordinates"]];
    url = `https://api.mapbox.com/optimized-trips/v1/mapbox/walking/${coordinate_list.join(';'
            )}?overview=full&steps=true&geometries=geojson&source=first&destination=last&roundtrip=false&access_token=${mapboxgl.accessToken}`;
          
    // ask for route
    const query = await fetch(url, {method: 'GET'});
    const response = await query.json();

    // get distance from route
    currentDistance = response.trips[0].distance;

    // if shortest, reset everything
    if (currentDistance < shortestDistance){
      shortestDistance = currentDistance;
      restingDirections = response;
    } 

    // update data/visual
    const routeGeoJSON = turf.featureCollection([
    turf.feature(restingDirections.trips[0].geometry)
  ]);
    map.getSource(`route0`).setData(routeGeoJSON);
    map.setPaintProperty(`route0`, 'line-color', '#74c476');
}
}