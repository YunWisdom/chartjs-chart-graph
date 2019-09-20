'use strict';

import * as Chart from 'chart.js';
import {listenArrayEvents, unlistenArrayEvents} from '../data';
import { forceSimulation, forceManyBody, forceLink, forceCenter } from 'd3-force';

const defaults = {
  scales: {
    xAxes: [{
      display: false
    }],
    yAxes: [{
      display: false
    }]
  },
  tooltips: {
    callbacks: {
      label(item, data) {
        return data.labels[item.index];
      }
    }
  }
};

Chart.defaults.forceDirectedGraph = Chart.helpers.merge({}, [Chart.defaults.scatter, defaults]);

export const ForceDirectedGraph = Chart.controllers.forceDirectedGraph = Chart.controllers.scatter.extend({
  dataElementType: Chart.elements.Point,
  edgeElementType: Chart.elements.Line,

  initialize(chart, datasetIndex) {
    this._simulation = forceSimulation()
      .force('charge', forceManyBody())
      .force('link', forceLink())
      .force('center', forceCenter())
      .on('tick', () => {
        this.chart.update();
      }).on('end', () => {
        this.chart.update();
      });
    Chart.controllers.scatter.prototype.initialize.call(this, chart, datasetIndex);
  },

  createEdgeMetaData(index) {
    return this.edgeElementType && new this.edgeElementType({
      _chart: this.chart,
      _datasetIndex: this.index,
      _index: index
    });
  },

  update(reset) {
    Chart.controllers.scatter.prototype.update.call(this, reset);

    const meta = this.getMeta();
    const edges = meta.edges || [];

    edges.forEach((edge, i) => this.updateEdgeElement(edge, i, reset));
    edges.forEach((edge) => edge.pivot());
  },

  _edgeListener: (() => ({
    onDataPush() {
      const count = arguments.length;
      this.insertEdgeElements(this.getDataset().edges.length - count, count)
    },
    onDataPop() {
      this.getMeta().edges.pop();
      this.resyncSimulation();
    },
    onDataShift() {
      this.getMeta().edges.shift();
      this.resyncSimulation();
    },
    onDataSplice(start, count) {
      this.getMeta().edges.splice(start, count);
      this.insertEdgeElements(start, arguments.length - 2);
    },
    onDataUnshift() {
      this.insertEdgeElements(0, arguments.length);
    }
  }))(),

  destroy() {
    Chart.controllers.scatter.destroy.call(this);
    if (this._edges) {
      unlistenArrayEvents(this._edges, this._edgeListener);
    }
  },

  updateElement(point, index, reset) {
    Chart.controllers.scatter.prototype.updateElement.call(this, point, index, reset);

    if (reset) {
      const xScale = this.getScaleForId(this.getMeta().xAxisID);
      point._model.x = xScale.getBasePixel();
    }
  },

  updateEdgeElement(line, index, _reset) {
    const dataset = this.getDataset();
    const edge = dataset.edges[index];
    const meta = this.getMeta();
    const points = meta.data;

    line._children = [points[edge.source.index], points[edge.target.index]];
    line._xScale = this.getScaleForId(meta.xAxisID);
    line._scale = line._yScale = this.getScaleForId(meta.yAxisID);

    line._datasetIndex = this.index;
    line._model = this._resolveLineOptions(line);
  },

  buildOrUpdateElements() {
    const dataset = this.getDataset();
    const edges = dataset.edges || (dataset.edges = []);

    // In order to correctly handle data addition/deletion animation (an thus simulate
    // real-time charts), we need to monitor these data modifications and synchronize
    // the internal meta data accordingly.
    if (this._edges !== edges) {
      if (this._edges) {
        // This case happens when the user replaced the data array instance.
        unlistenArrayEvents(this._edges, this._edgeListener);
      }

      if (edges && Object.isExtensible(edges)) {
        listenArrayEvents(edges, this._edgeListener);
      }
      this._edges = edges;
    }

    Chart.controllers.scatter.prototype.buildOrUpdateElements.call(this);
  },

  transition(easingValue) {
    Chart.controllers.scatter.prototype.transition.call(this, easingValue);

    const meta = this.getMeta();
    const edges = meta.edges || [];

    edges.forEach((edge) => edge.transition(easingValue));
  },

  draw() {
    const meta = this.getMeta();
    const edges = meta.edges || [];
    const area = this.chart.chartArea;

    if (edges.length > 0) {
      Chart.helpers.canvas.clipArea(this.chart.ctx, {
        left: area.left,
        right: area.right,
        top: area.top,
        bottom: area.bottom
      });

      edges.forEach((edge) => edge.draw());

      Chart.helpers.canvas.unclipArea(this.chart.ctx);
    }

    Chart.controllers.scatter.prototype.draw.call(this);
  },

  resyncElements() {
    Chart.controllers.scatter.prototype.resyncElements.call(this);
    const meta = this.getMeta();
    const edges = this.getDataset().edges;
    const metaEdges = meta.edges || (meta.edges = []);
    const numMeta = metaEdges.length;
		const numData = edges.length;

		if (numData < numMeta) {
			metaEdges.splice(numData, numMeta - numData);
      this.resyncSimulation();
		} else if (numData > numMeta) {
			this.insertEdgeElements(numMeta, numData - numMeta);
    }
  },

  resyncSimulation() {
    this._simulation.nodes(this.getDataset().data);
    this._simulation.force('link').links(this.getDataset().edges || []);
    this._simulation.restart();
  },

  addElements() {
    Chart.controllers.scatter.prototype.addElements.call(this);

		const meta = this.getMeta();
		const edges = this.getDataset().edges || [];
		const metaData = meta.edges || (meta.edges = []);

		for (let i = 0; i < edges.length; ++i) {
			metaData[i] = metaData[i] || this.createEdgeMetaData(i);
		}
    this.resyncSimulation();
	},

	addEdgeElementAndReset(index) {
		const element = this.createEdgeMetaData(index);
		this.getMeta().edges.splice(index, 0, element);
		this.updateEdgeElement(element, index, true);
	},

	insertEdgeElements(start, count) {
		for (let i = 0; i < count; ++i) {
			this.addEdgeElementAndReset(start + i);
		}
    this.resyncSimulation();
	},
});