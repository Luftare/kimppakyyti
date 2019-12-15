import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import Feature from 'ol/Feature';
import { Point } from 'ol/geom';
import Draw from 'ol/interaction/Draw';
import Select from 'ol/interaction/Select';
import { click } from 'ol/events/condition';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import { OSM, Vector as VectorSource } from 'ol/source';
import { Style, Fill, Stroke, Icon } from 'ol/style';
import { transform } from 'ol/proj.js';
import locationIcon from './assets/location-icon.png';

import Vue from 'vue/dist/vue.common.prod';
import _ from 'lodash';

const ANIMATION_TIME = 200;

const defaultViewProps = (() => {
  const { lat, long, zoom } = getUserCoordinates();

  return {
    center: transform([long, lat], 'EPSG:4326', 'EPSG:3857'),
    zoom,
  };
})();

function getUserCoordinates() {
  const urlParams = new URLSearchParams(window.location.search);

  const hasGoogleCoordinates = urlParams.has('g');
  if (hasGoogleCoordinates) {
    const rawString = urlParams.get('g');
    const cleanedString = rawString
      .split('@')
      .join('')
      .split('z')
      .join('');
    const [lat, long, zoom] = cleanedString.split(',');
    return { lat, long, zoom };
  } else {
    const lat = parseFloat(urlParams.get('lat')) || 60.1705413;
    const long = parseFloat(urlParams.get('long')) || 24.93961;
    const zoom = parseFloat(urlParams.get('zoom')) || 11;
    return { lat, long, zoom };
  }
}

const app = new Vue({
  el: '#root',
  data: {
    drawing: false,
    drawGuide: false,
    rides: [],
    recentFeature: null,
    passengerName: '',
    showPassengerModal: false,
    editRideModalVisible: false,
    rideForm: {
      visible: false,
      driverName: '',
      minutes: 30,
      seatCount: 2,
    },
    notification: '',
    notificationVisible: false,
  },
  computed: {
    selectedRide() {
      return this.rides.find(r => r.selected);
    },
    rideSelected() {
      return this.rides.some(r => r.selected);
    },
    departureTime() {
      return Date.now() + this.rideForm.minutes * 60 * 1000;
    },
    scheduledRides() {
      return [...this.rides].sort((a, b) => a.time - b.time);
    },
  },
  filters: {
    minutesToMs: minutes => {
      return minutes * 60 * 1000;
    },
    timeUntil: ms => {
      return ms - Date.now();
    },
    duration: dt => {
      const minutes = dt / 1000 / 60;
      const hours = minutes / 60;
      const wholeHours = Math.floor(hours);
      const remainderMinutes = minutes - wholeHours * 60;

      if (wholeHours < 1) {
        return `${Math.round(minutes)} min`;
      }

      return `${wholeHours} h ${Math.round(remainderMinutes)} min`;
    },
    minutesToDuration: minutes => {
      if (minutes <= 60) {
        return `${Math.round(minutes)} min`;
      }

      return `${Math.round(minutes / 6) / 10} h`.split('.').join(',');
    },
    time: ms => {
      const date = new Date(ms);
      const hours = (date.getHours() + '').padStart(2, '0');
      const minutes = (date.getMinutes() + '').padStart(2, '0');
      return `${hours}:${minutes}`;
    },
  },
  mounted() {
    this.resetRideForm();

    setInterval(() => {
      this.sanitizeRides();
    }, 20 * 1000);
  },
  methods: {
    handleInteraction() {
      debouncedResetView();
    },
    handleDriverNameChange(e) {
      this.rideForm.driverName = e.target.value.substr(0, 42);
    },
    startDrawing() {
      this.drawing = true;
      this.drawGuide = true;
      setDrawingEnabled(true);

      setTimeout(() => {
        this.drawGuide = false;
      }, 2500);
    },
    finishDrawing(feature) {
      this.showRideForm();
      this.recentFeature = feature;
      setDrawingEnabled(false);
    },
    highlightRide(feature) {
      const selectedRide = this.rides.find(r => r.feature === feature);

      this.editRideModalVisible = false;

      if (selectedRide) {
        if (selectedRide.selected) {
          setTimeout(() => zoomToFeature(feature), ANIMATION_TIME);
        }
      }

      source
        .getFeatures()
        .filter(f => f.getProperties().isRide)
        .forEach(rideFeature => {
          const style =
            rideFeature === feature
              ? featureStyles.selected
              : featureStyles.normal;
          rideFeature.setStyle(style);
        });

      this.rides.forEach(ride => {
        ride.selected = selectedRide === ride;
      });
    },
    resetView() {
      resetView();
    },
    sanitizeRides() {
      const rideIsValid = ({ time }) => time - Date.now() > 0;
      this.rides = this.rides.filter(ride => {
        const isValid = rideIsValid(ride);

        if (!isValid) {
          source.removeFeature(ride.feature);
        }

        return isValid;
      });
    },
    resetRideForm() {
      this.rideForm.driverName = '';
      this.rideForm.minutes = 60;
      this.rideForm.seatCount = 3;
    },
    incrementTime() {
      this.rideForm.minutes += 15;
    },
    decrementTime() {
      this.rideForm.minutes -= 15;
    },
    incrementPax() {
      this.rideForm.seatCount++;
    },
    decrementPax() {
      this.rideForm.seatCount--;
    },
    showRideForm() {
      this.resetRideForm();
      this.rideForm.visible = true;
    },
    hideRideForm() {
      this.rideForm.visible = false;

      setTimeout(scrollToDefaultView, ANIMATION_TIME);
    },
    cancelAddRide() {
      if (this.recentFeature) {
        source.removeFeature(this.recentFeature);
        this.recentFeature = null;
      }

      this.drawing = false;
      this.hideRideForm();
      setDrawingEnabled(false);
    },
    selectRide(ride) {
      this.editRideModalVisible = false;
      this.highlightRide(ride.feature);
    },
    addRide() {
      const passcode = Math.ceil(Math.random() * 100);

      const ride = {
        feature: this.recentFeature,
        driverName: this.rideForm.driverName,
        time: Date.now() + this.rideForm.minutes * 60 * 1000,
        seatCount: this.rideForm.seatCount,
        passengers: [],
        passengerName: '',
        selected: false,
        passcode,
      };

      this.rides.push(ride);
      this.recentFeature = null;
      this.drawing = false;

      this.hideRideForm();
      alert(`Tällä koodilla voit muokata kyytiä: ${passcode}`);
    },
    removeRide(ride) {
      if (!confirm('Haluatko varmasti poistaa kyydin?')) return;
      source.removeFeature(ride.feature);
      this.rides = this.rides.filter(r => r !== ride);
    },
    addPassenger() {
      this.selectedRide.passengers.push(this.passengerName);
      this.passengerName = '';
      this.showPassengerModal = false;
      this.showNotification(
        `Ilmoittauduit kyytiin, jonka kuljettaja on: ${this.selectedRide.driverName}`
      );
    },
    showNotification(msg) {
      this.notification = msg;
      this.notificationVisible = true;
      hideNotification();
    },
    showEditRideModal() {
      const receivedPasscode = parseInt(
        prompt('Anna koodi muokataksesi tätä kyytiä:')
      );
      const correctPasscode = receivedPasscode === this.selectedRide.passcode;

      if (correctPasscode) {
        this.editRideModalVisible = true;
      } else {
        this.showNotification('Väärä koodi');
      }
    },
  },
});

const hideNotification = _.debounce(() => {
  app.notificationVisible = false;
}, 4000);

const resetView = () => {
  scrollToDefaultView();
  app.showPassengerModal = false;
  app.highlightRide(null);
  app.cancelAddRide();
};

const debouncedResetView = _.debounce(resetView, 60 * 1000);

function scrollToDefaultView() {
  map.updateSize();
  map.getView().setCenter(defaultViewProps.center);
  map.getView().setZoom(defaultViewProps.zoom);
}

function zoomToFeature(feature) {
  map.updateSize();
  map.getView().fit(feature.getGeometry(), { padding: [100, 100, 100, 100] });
}

function setDrawingEnabled(enabled) {
  if (enabled) {
    map.addInteraction(interaction);
  } else {
    map.removeInteraction(interaction);
  }
}

const iconFeature = new Feature({
  geometry: new Point(defaultViewProps.center),
});

iconFeature.setStyle(
  new Style({
    image: new Icon({
      anchor: [0.5, 1],
      anchorXUnits: 'fraction',
      anchorYUnits: 'fraction',
      src: locationIcon,
      scale: 0.1,
    }),
  })
);

const raster = new TileLayer({
  source: new OSM(),
});

const source = new VectorSource({ wrapX: false });

const featureStyles = {
  normal: new Style({
    fill: new Fill({
      color: 'rgba(25, 25, 255, 0.05)',
    }),
    stroke: new Stroke({
      color: 'rgba(25, 25, 255, 1)',
      width: 2,
    }),
  }),
  selected: new Style({
    fill: new Fill({
      color: 'rgba(25, 25, 255, 0.4)',
    }),
    stroke: new Stroke({
      color: 'rgba(25, 25, 255, 1)',
      width: 2,
    }),
  }),
};

const vector = new VectorLayer({
  source,
  style: featureStyles.normal,
});

const map = new Map({
  layers: [raster, vector],
  target: 'map',
  view: new View(defaultViewProps),
});

source.addFeatures([iconFeature]);

const interaction = new Draw({
  source,
  type: 'Polygon',
  freehand: true,
});

interaction.on('drawend', ({ feature }) => {
  feature.setProperties({
    isRide: true,
  });
  app.finishDrawing(feature);

  setTimeout(() => zoomToFeature(feature), ANIMATION_TIME);
});

const select = new Select();

select.on('select', e => {
  const feature = e.selected[0];

  if (feature) {
    feature.setStyle(featureStyles.selected);
  }

  app.highlightRide(feature);
});

map.addInteraction(select);
