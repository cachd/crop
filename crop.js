/**
 * A standalone JavaScript plugin for cross-browser (including mobile) crop.
 *
 * @name Crop
 * @version 0.1.8
 * @author Aleksandras Nelkinas
 * @license [MIT]{@link http://opensource.org/licenses/mit-license.php}
 *
 * Copyright (c) 2013-2014 Aleksandras Nelkinas
 */

;(function (root, factory) {

  if (typeof define === 'function' && define.amd) {
    define(factory);
  } else {
    root.Crop = factory();
  }

}(this, function () {
  'use strict';

  var touchSupported = !!(('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch),
      defaults;

  function int(val) {
    return parseInt(val, 10);
  }

  function extend() {
    var iter;

    for (iter = 1; iter < arguments.length; iter++) {
      var key;

      for (key in arguments[iter]) {
        if (arguments[iter].hasOwnProperty(key)) {
          arguments[0][key] = arguments[iter][key];
        }
      }
    }
    return arguments[0];
  }

  defaults = {
    coords: null,
    upscale: false,
    onChange: null
  };

  function Crop(element, opts) {
    var self = this,
        originalImageEl;

    // handle constructor call without `new` keyword
    if (!(this instanceof Crop)) {
      return new Crop(element, opts);
    }

    // is plugin already initialized?
    if (this.container) {
      return;
    }

    this.container = new Element(element);
    this.opts = extend({}, defaults, opts || {});

    // keep reference to original image element as it will be soon detached
    this.originalImage = new Element(this.container[0].querySelector('img'));
    originalImageEl = this.originalImage[0];

    this.image = new Element(originalImageEl.cloneNode(false));

    originalImageEl.parentNode.insertBefore(this.image[0], originalImageEl.nextSibling);
    originalImageEl.parentNode.removeChild(originalImageEl);

    imageLoaded.call(this, function () {
      var coords = self.opts.coords;

      if (coords && self.opts.translateCoordsTo) {
        coords = translateCoords(coords, self.opts.translateCoordsTo, getImageSize.call(self));
      }
      initializeImage.apply(self, coords);
      bindMoveEvents.call(self);
    });

    return this;
  }

  extend(Crop.prototype, {

    /**
     * Destroys crop instance.
     */
    destroy: function () {
      var imageEl = this.image[0];
      
      unbindMoveEvents.call(this);

      // restore original, unmodified image
      imageEl.parentNode.insertBefore(this.originalImage[0], imageEl.nextSibling);
      imageEl.parentNode.removeChild(imageEl);
      delete this.originalImage;
      delete this.image;

      delete this.container;
      delete this.opts;
    },

    /**
     * Returns currently set crop coordinates.
     *
     * @returns {Array}  Coordinates as [[x, y], [x2, y2]].
     */
    getCoords: function () {
      var containerSize = getContainerSize.call(this),
          size = getImageSize.call(this),
          position = getImagePosition.call(this),
          data = this.image.dataset,
          widthRatio, heightRatio,
          point1, point2;

      widthRatio = data.originalWidth / size[0];
      heightRatio = data.originalHeight / size[1];

      point1 = [
        Math.round(-1 * position[0] * widthRatio),
        Math.round(-1 * position[1] * heightRatio)
      ];
      point2 = [
        Math.round(point1[0] + containerSize[0] * widthRatio),
        Math.round(point1[1] + containerSize[1] * heightRatio)
      ];

      if (this.opts.translateCoordsTo) {
        return translateCoords([point1, point2], [data.originalWidth, data.originalHeight], this.opts.translateCoordsTo);
      }
      return [point1, point2];
    },

    /**
     * Positions image inside a container.
     *
     * @param {Number} x
     * @param {Number} y
     * @returns {Array}  New position as [x, y].
     */
    positionImage: function (x, y) {
      var containerSize = getContainerSize.call(this),
          size = getImageSize.call(this),
          data = this.image.dataset,
          position = {
            left: 'auto',
            right: 'auto',
            top: 'auto',
            bottom: 'auto'
          },
          style;

      x = (x < 0) ? Math.round(x) : 0;
      y = (y < 0) ? Math.round(y) : 0;

      if (x + size[0] >= containerSize[0]) {
        position.left = x + 'px';
      } else {
        position.right = '0px';
        x = -1 * (size[0] - containerSize[0]);
      }

      if (y + size[1] >= containerSize[1]) {
        position.top = y + 'px';
      } else {
        position.bottom = '0px';
        y = -1 * (size[1] - containerSize[1]);
      }

      style = this.image[0].style;
      style.left = position.left;
      style.right = position.right;
      style.top = position.top;
      style.bottom = position.bottom;

      data.x = x;
      data.y = y;

      if (typeof this.opts.onChange === 'function') {
        this.opts.onChange(this.container[0], this.getCoords());
      }

      return [x, y];
    },

    /**
     * Resizes image.
     *
     * @param {Number} width
     * @param {Number} height
     * @returns {Array}  New size as [width, height].
     */
    resizeImage: function (width, height) {
      var containerSize = getContainerSize.call(this),
          el = this.image[0],
          data = this.image.dataset,
          aspectRatio = data.originalWidth / data.originalHeight,
          newWidth = containerSize[0],
          newHeight = containerSize[1],
          minSize = this.opts.minSize,
          shouldReposition = true,
          maxRatio,
          containerRatio;

      // do not allow to upscale image by default
      if (!this.opts.upscale && (width > data.originalWidth || height > data.originalHeight)) {
        width = data.originalWidth;
        height = data.originalHeight;
      }

      // do not exceed min. crop size if such is provided
      if (minSize) {
        maxRatio = [data.originalWidth / minSize[0], data.originalHeight / minSize[1]];

        if (width / containerSize[0] > maxRatio[0] || height / containerSize[1] > maxRatio[1]) {
          containerRatio = [minSize[0] / containerSize[0], minSize[1] / containerSize[1]];

          width = data.originalWidth / containerRatio[0];
          height = data.originalHeight / containerRatio[1];
        }
      }

      if (width >= containerSize[0] && height >= containerSize[1]) {
        newWidth = width;
        newHeight = height;
      } else if (width >= containerSize[0]) {
        newWidth = newHeight * aspectRatio;
      } else if (height >= containerSize[1]) {
        newHeight = newWidth / aspectRatio;
      } else {
        newWidth = el.width;
        newHeight = el.height;
      }

      newWidth = Math.round(newWidth);
      newHeight = Math.round(newHeight);

      if (newWidth === el.width && newHeight === el.height) {
        shouldReposition = false;
      }

      el.width = newWidth;
      el.height = newHeight;

      return shouldReposition ? [newWidth, newHeight] : false;
    },

    /**
     * Scales image.
     *
     * @param {Number} ratio
     * @returns {Array|Boolean}  New position as [x, y].
     */
    scaleImage: function (ratio) {
      var containerSize = getContainerSize.call(this),
          size = getImageSize.call(this),
          position = getImagePosition.call(this),
          width = size[0] * ratio,
          height = size[1] * ratio,
          newSize,
          actualRatio,
          x, y;

      if (newSize = this.resizeImage(width, height)) {
        actualRatio = newSize[0] / size[0] - 1;

        x = position[0] - (Math.abs(position[0]) + containerSize[0] / 2) * actualRatio;
        y = position[1] - (Math.abs(position[1]) + containerSize[1] / 2) * actualRatio;

        return this.positionImage(x, y);
      }
      return false;
    }

  });

  /**
   * Custom element with dataset support.
   *
   * @param {HTMLElement} element
   * @constructor
   */
  function Element(element) {
    this[0] = element;
    this.dataset = {};
  }

  /**
   * Determines whether image has loaded.
   *
   * @memberof Crop
   * @param {Function} callback  Called when state has been determined.
   * @private
   */
  function imageLoaded(callback) {
    var imageEl = this.image[0];

    if (imageEl.complete || imageEl.readyState === 4) {
      callback();
    } else {
      imageEl.addEventListener('load', callback)
    }
  }

  /**
   * Initializes image by resizing and then positioning it.
   *
   * @memberof Crop
   * @param {Array} [point1]  Position as [x, y].
   * @param {Array} [point2]  Position as [x, y].
   * @private
   */
  function initializeImage(point1, point2) {
    var containerSize = getContainerSize.call(this),
        size = getImageSize.call(this),
        data = this.image.dataset,
        widthRatio, heightRatio;

    if (!point1) {
      point1 = [0, 0];
      point2 = (size[0] >= size[1]) ? [size[1], size[1]] : [size[0], size[0]];
    }

    widthRatio = containerSize[0] / (point2[0] - point1[0]);
    heightRatio = containerSize[1] / (point2[1] - point1[1]);

    data.originalWidth = size[0];
    data.originalHeight = size[1];

    this.resizeImage(size[0] * widthRatio, size[1] * heightRatio);
    this.positionImage(-1 * point1[0] * widthRatio, -1 * point1[1] * heightRatio);
  }

  /**
   * Binds events for moving the image.
   *
   * @memberof Crop
   * @private
   */
  function bindMoveEvents() {
    var self = this,
        initialPointerPosition,
        initialImagePosition;

    function bindEvent(element, name, handler) {
      element.addEventListener(name, handler);

      if (!this.boundEvents) {
        this.boundEvents = [];
      }

      this.boundEvents.push({ element: element, name: name, handler: handler });
    }

    function pointerDownHandler(e) {
      initialPointerPosition = calculatePointerPosition.call(self, e);
      initialImagePosition = getImagePosition.call(self);

      document.addEventListener(touchSupported ? 'touchmove' : 'mousemove', pointerMoveHandler);
    }

    function pointerMoveHandler(e) {
      if (e.touches && e.touches.length > 1) {
        return;
      }
      
      var pointerPosition = calculatePointerPosition.call(self, e),
          newX = initialImagePosition[0] + (-1 * (initialPointerPosition[0] - pointerPosition[0])),
          newY = initialImagePosition[1] + (-1 * (initialPointerPosition[1] - pointerPosition[1]));

      e.preventDefault();

      self.positionImage.call(self, newX, newY);
    }

    function pointerUpHandler() {
      document.removeEventListener(touchSupported ? 'touchmove' : 'mousemove', pointerMoveHandler);
    }

    bindEvent.call(this, this.container[0], touchSupported ? 'touchstart' : 'mousedown', pointerDownHandler);
    bindEvent.call(this, document, touchSupported ? 'touchend' : 'mouseup', pointerUpHandler);
  }

  /**
   * Unbinds all previously bound events for moving the image.
   *
   * @memberof Crop
   * @private
   */
  function unbindMoveEvents() {
    var iter,
        total,
        event;

    for (iter = 0, total = this.boundEvents.length; iter < total; iter++) {
      event = this.boundEvents[iter];

      event.element.removeEventListener(event.name, event.handler);
    }
    delete this.boundEvents;
  }

  /**
   * Initially caches container's size and always returns cached value.
   *
   * @memberof Crop
   * @returns {Array}  Size as [width, height].
   */
  function getContainerSize() {
    var el = this.container[0],
        data = this.container.dataset,
        width = data.width,
        height = data.height,
        style,
        borderWidth,
        borderHeight,
        computedWidth,
        computedHeight;

    if (!width || !height) {
      style = getComputedStyle(el, null);
      borderWidth = int(style.getPropertyValue('border-left-width')) + int(style.getPropertyValue('border-right-width'));
      borderHeight = int(style.getPropertyValue('border-top-width')) + int(style.getPropertyValue('border-bottom-width'));

      computedWidth = el.offsetWidth - borderWidth;
      computedHeight = el.offsetHeight - borderHeight;

      data.width = computedWidth;
      data.height = computedHeight;

      width = computedWidth;
      height = computedHeight;
    }

    return [int(width), int(height)];
  }

  /**
   * Returns image's size.
   *
   * @memberof Crop
   * @returns {Array}  Size as [width, height].
   */
  function getImageSize() {
    var imageEl = this.image[0];

    return [imageEl.clientWidth, imageEl.clientHeight];
  }

  /**
   * Returns image's position.
   *
   * @memberof Crop
   * @returns {Array}  Position as [x, y].
   */
  function getImagePosition() {
    var data = this.image.dataset;

    return [data.x, data.y];
  }

  /**
   * Calculates pointer's position in relation to container.
   *
   * @memberof Crop
   * @param {Event} e
   * @returns {Array}  Position as [x, y].
   */
  function calculatePointerPosition(e) {
    var offset = this.container[0].getBoundingClientRect();

    if (e.touches && e.touches.length) {
      e = e.touches[0];
    }

    return [e.pageX - offset.left, e.pageY - offset.top];
  }

  /**
   * Translates crop coordinates to another scale.
   *
   * @param {Array} coords  Coordinates as [[x, y], [x2, y2]].
   * @param {Array} from    Current size as [width, height].
   * @param {Array} to      Target size as [width, height].
   * @returns {Array}       Translated coordinates as [[x, y], [x2, y2]].
   */
  function translateCoords(coords, from, to) {
    var widthRatio = to[0] / from[0],
        heightRatio = to[1] / from[1];

    return coords.map(function (coord) {
      return [coord[0] * widthRatio, coord[1] * heightRatio].map(Math.round);
    });
  }

  return Crop;

}));
