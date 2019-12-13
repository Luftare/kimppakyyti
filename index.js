import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import Draw from 'ol/interaction/Draw';
import Select from 'ol/interaction/Select';
import { click } from 'ol/events/condition';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import { OSM, Vector as VectorSource } from 'ol/source';
import { Style, Fill, Stroke } from 'ol/style';
import Vue from 'vue/dist/vue.common.prod';

const ANIMATION_TIME = 200;

const app = new Vue({
  el: '#root',
  data: {
    drawing: false,
    drawGuide: false,
    rides: [],
    recentFeature: null,
    rideForm: {
      visible: false,
      driverName: '',
      minutes: 30,
      seatCount: 2,
    },
  },
  computed: {
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
    timeUntil: ms => {
      const dt = ms - Date.now();
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
    }, 2000);
  },
  methods: {
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

      this.rides.forEach(ride => {
        ride.selected = selectedRide === ride;
      });
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
      this.rideForm.driverName = 'autolija';
      this.rideForm.minutes = 30;
      this.rideForm.seatCount = 1;
    },
    incrementTime() {
      this.rideForm.minutes += 30;
    },
    decrementTime() {
      this.rideForm.minutes -= 30;
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
    addRide() {
      const ride = {
        feature: this.recentFeature,
        driverName: this.rideForm.driverName,
        time: Date.now() + this.rideForm.minutes * 60 * 1000,
        seatCount: this.rideForm.seatCount,
        selected: false,
      };
      this.rides.push(ride);
      this.recentFeature = null;
      this.drawing = false;

      this.hideRideForm();
    },
    removeRide(ride) {
      source.removeFeature(ride.feature);
      this.rides = this.rides.filter(r => r !== ride);
    },
  },
});

const checkbox = document.getElementById('draw-checkbox');
const rideForm = document.querySelector('.ride-form');

const defaultViewProps = {
  center: [2750000, 8440000],
  zoom: 12,
};

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

const raster = new TileLayer({
  source: new OSM(),
});

const source = new VectorSource({ wrapX: false });

const vector = new VectorLayer({
  source,
  style: new Style({
    fill: new Fill({
      color: 'rgba(255, 25, 25, 0.5)',
    }),
    stroke: new Stroke({
      color: 'red',
      width: 2,
    }),
  }),
});

const map = new Map({
  layers: [raster, vector],
  target: 'map',
  view: new View(defaultViewProps),
});

const interaction = new Draw({
  source,
  type: 'Polygon',
  freehand: true,
});

interaction.on('drawend', ({ feature }) => {
  app.finishDrawing(feature);

  setTimeout(() => zoomToFeature(feature), ANIMATION_TIME);
});

interaction.on('change:active', () => {
  console.log(123);
});

const select = new Select();

select.on('select', e => {
  const feature = e.selected[0];

  app.highlightRide(feature);
});

map.addInteraction(select);
