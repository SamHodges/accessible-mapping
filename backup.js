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
  alternatives: 'true', //show alternatives 
});

// where directions box is on the map
map.addControl(directions, 'top-left');

// click for second place option
map.on('click', (event) => {
  // get coordinates from mouse
  const coords = Object.keys(event.lngLat).map((key) => event.lngLat[key]);

  // if end exists, add this as a waypoint
  if (map.getLayer('end')) {
    // format data as needed
    const next_stop = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Point',
            coordinates: coords
          }
        }
      ]
    };
    // add as waypoint
    directions.addWaypoint(0, next_stop['features'][0].geometry.coordinates);

    // add visual component to it
    map.addLayer({
      id: 'waypoint',
      type: 'circle',
      source: {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Point',
                coordinates: coords
              }
            }
          ]
        }
      },
      paint: {
        'circle-radius': 10,
        'circle-color': '#f30'
      }
    });
  } 

  // if end doesn't exist, add it
  else {
    map.addLayer({
      id: 'end',
      type: 'circle',
      source: {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Point',
                coordinates: coords
              }
            }
          ]
        }
      },
      paint: {
        'circle-radius': 10,
        'circle-color': '#f30'
      }
    });
  }
});

