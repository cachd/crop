/**
 * A standalone JavaScript plugin for cross-browser (including mobile) crop.
 *
 * @name Crop
 * @version 0.1.5
 * @author Aleksandras Nelkinas
 * @license [MIT]{@link http://opensource.org/licenses/mit-license.php}
 *
 * Copyright (c) 2013 Aleksandras Nelkinas
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

  function getDataset(element){
    var attributes = element.attributes,
        dataset = {},
        iter,
        key,
        value;

    for (iter = attributes.length; iter--; ){
      if (/^data-.*/.test(attributes[iter].name)) {
        key = attributes[iter].name.replace('data-', '');
        value = element.getAttribute(attributes[iter].name);
        dataset[key] = value;
      }
    }
    return dataset;
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
    var self = this;

    // handle constructor call without `new` keyword
    if (!(this instanceof Crop)) {
      return new Crop(element, opts);
    }

    // is plugin already initialized?
    if (this.el) {
      return;
    }

    this.el = element;
    this.opts = extend({}, defaults, opts || {});

    // keep reference to original image element as it will be soon detached
    this.originalImageEl = this.el.querySelector('img');

    this.imageEl = this.originalImageEl.cloneNode(false);

    this.originalImageEl.parentNode.insertBefore(this.imageEl, this.originalImageEl.nextSibling);
    this.originalImageEl.parentNode.removeChild(this.originalImageEl);

    imageLoaded.call(this, function () {
      if (initializeImage.apply(self, self.opts.coords)) {
        bindMoveEvents.call(self);
      }
    });

    return this;
  }

  extend(Crop.prototype, {

    /**
     * Destroys crop instance.
     */
    destroy: function () {
      var data = this.el.dataset || getDataset(this.el);

      delete data.width;
      delete data.height;

      unbindMoveEvents.call(this);

      // restore original, unmodified image
      this.imageEl.parentNode.insertBefore(this.originalImageEl, this.imageEl.nextSibling);
      this.imageEl.parentNode.removeChild(this.imageEl);
      delete this.originalImageEl;
      delete this.imageEl;

      delete this.el;
      delete this.opts;
    },

    /**
     * Returns currently set crop coordinates.
     *
     * @returns {Array} Coordinates as [[x, y], [x2, y2]].
     */
    getCoords: function () {
      var containerSize = getContainerSize.call(this),
          size = getImageSize.call(this),
          position = getImagePosition.call(this),
          data = this.imageEl.dataset || getDataset(this.imageEl),
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

      return [point1, point2];
    },

    /**
     * Positions image inside a container.
     *
     * @param {Number} x
     * @param {Number} y
     * @returns {Array} New position as [x, y].
     */
    positionImage: function (x, y) {
      var containerSize = getContainerSize.call(this),
          size = getImageSize.call(this),
          data = this.imageEl.dataset || getDataset(this.imageEl),
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

      style = this.imageEl.style;
      style.left = position.left;
      style.right = position.right;
      style.top = position.top;
      style.bottom = position.bottom;

      if (this.imageEl.dataset) {
        data.x = x;
        data.y = y;
      } else {
        this.imageEl.setAttribute('data-x', x);
        this.imageEl.setAttribute('data-y', y);
      }

      if (typeof this.opts.onChange === 'function') {
        this.opts.onChange(this.el, this.getCoords());
      }

      return [x, y];
    },

    /**
     * Resizes image.
     *
     * @param {Number} width
     * @param {Number} height
     * @returns {Array} New size as [width, height].
     */
    resizeImage: function (width, height) {
      var containerSize = getContainerSize.call(this),
          data = this.imageEl.dataset || getDataset(this.imageEl),
          aspectRatio = data.originalWidth / data.originalHeight,
          newWidth = containerSize[0],
          newHeight = containerSize[1];

      if (!this.opts.upscale && (width > data.originalWidth || height > data.originalHeight)) {
        return false;
      }

      if (width >= containerSize[0] && height >= containerSize[1]) {
        newWidth = width;
        newHeight = height;
      } else if (width >= containerSize[0]) {
        newWidth = newHeight * aspectRatio;
      } else if (height >= containerSize[1]) {
        newHeight = newWidth / aspectRatio;
      }

      newWidth = Math.round(newWidth);
      newHeight = Math.round(newHeight);

      this.imageEl.width = newWidth;
      this.imageEl.height = newHeight;

      return [newWidth, newHeight];
    },

    /**
     * Scales image.
     *
     * @param {Number} ratio
     * @returns {Array|Boolean} New position as [x, y]
     */
    scaleImage: function (ratio) {
      var containerSize = getContainerSize.call(this),
          size = getImageSize.call(this),
          position = getImagePosition.call(this),
          width = size[0] * ratio,
          height = size[1] * ratio,
          x, y;

      ratio -= 1;

      if (this.resizeImage(width, height)) {
        x = position[0] - (Math.abs(position[0]) + containerSize[0] / 2) * ratio;
        y = position[1] - (Math.abs(position[1]) + containerSize[1] / 2) * ratio;

        return this.positionImage(x, y);
      }
      return false;
    }

  });

  /**
   * Determines whether image has loaded.
   *
   * @memberof Crop
   * @param {Function} callback Called when state has been determined.
   * @private
   */
  function imageLoaded(callback) {
    if (this.imageEl.complete || this.imageEl.readyState === 4) {
      callback();
    } else {
      this.imageEl.addEventListener('load', callback)
    }
  }

  /**
   * Initializes image by resizing and then positioning it.
   *
   * @memberof Crop
   * @param {Array|null} [point1] Position as [x, y].
   * @param {Array} [point2] Position as [x, y].
   * @returns {Boolean} Was initialization successful or not.
   * @private
   */
  function initializeImage(point1, point2) {
    var containerSize = getContainerSize.call(this),
        size = getImageSize.call(this),
        data = this.imageEl.dataset || getDataset(this.imageEl),
        widthRatio, heightRatio;

    if (!point1) {
      point1 = [0, 0];
      point2 = (size[0] >= size[1]) ? [size[1], size[1]] : [size[0], size[0]];
    }

    widthRatio = containerSize[0] / (point2[0] - point1[0]);
    heightRatio = containerSize[1] / (point2[1] - point1[1]);

    if (this.imageEl.dataset) {
      data.originalWidth = size[0];
      data.originalHeight = size[1];
    } else {
      this.imageEl.setAttribute('data-originalWidth', size[0]);
      this.imageEl.setAttribute('data-originalHeight', size[1]);
    }

    if (this.resizeImage(size[0] * widthRatio, size[1] * heightRatio)) {
      return !!this.positionImage(-1 * point1[0] * widthRatio, -1 * point1[1] * heightRatio);
    }

    return false;
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

    bindEvent.call(this, this.el, touchSupported ? 'touchstart' : 'mousedown', pointerDownHandler);
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
   * @returns {Array} Size as [width, height]
   */
  function getContainerSize() {
    var data = this.el.dataset || getDataset(this.el),
        width = data.width,
        height = data.height,
        style,
        borderWidth,
        borderHeight,
        computedWidth,
        computedHeight;

    if (!width || !height) {
      style = getComputedStyle(this.el, null);
      borderWidth = int(style.getPropertyValue('border-left-width')) + int(style.getPropertyValue('border-right-width'));
      borderHeight = int(style.getPropertyValue('border-top-width')) + int(style.getPropertyValue('border-bottom-width'));

      computedWidth = this.el.offsetWidth - borderWidth;
      computedHeight = this.el.offsetHeight - borderHeight;

      if (this.el.dataset) {
        data.width = computedWidth;
        data.height = computedHeight;
      } else {
        this.el.setAttribute('data-width', computedWidth);
        this.el.setAttribute('data-height', computedHeight);
      }

      width = computedWidth;
      height = computedHeight;
    }

    return [int(width), int(height)];
  }

  /**
   * Returns image's size.
   *
   * @memberof Crop
   * @returns {Array} Size as [width, height].
   */
  function getImageSize() {
    return [this.imageEl.clientWidth, this.imageEl.clientHeight];
  }

  /**
   * Returns image's position.
   *
   * @memberof Crop
   * @returns {Array} Position as [x, y].
   */
  function getImagePosition() {
    var data = this.imageEl.dataset || getDataset(this.imageEl);

    return [int(data.x), int(data.y)];
  }

  /**
   * Calculates pointer's position in relation to container.
   *
   * @memberof Crop
   * @param {Event} e
   * @returns {Array} Position as [x, y].
   */
  function calculatePointerPosition(e) {
    var offset = this.el.getBoundingClientRect();

    if (e.touches && e.touches.length) {
      e = e.touches[0];
    }

    return [e.pageX - offset.left, e.pageY - offset.top];
  }

  return Crop;

}));
