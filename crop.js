/**
 * A standalone JavaScript plugin for cross-browser (including mobile) crop.
 *
 * @name Crop
 * @version 0.1.9
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
      var size = getImageSize.call(self),
          transform = self.opts.transform,
          coords = self.opts.coords || getCenteredSquareCoords(transform ? transform.realSize : size);

      if (transform) {
        coords = moveCoords(coords.map(function (coords) {
          var realSize = unifyDimensions(transform.realSize, size);

          if (transform.rotation) {
            coords = rotateCoords(coords, realSize, transform.rotation);
          }
          coords = scaleCoords(coords, realSize, size);

          return coords;
        }));
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
          originalSize = getOriginalSize.call(this),
          position = getImagePosition.call(this),
          transform = this.opts.transform,
          widthRatio, heightRatio,
          point1, point2,
          coords;

      widthRatio = originalSize[0] / size[0];
      heightRatio = originalSize[1] / size[1];

      point1 = [
        Math.round(-1 * position[0] * widthRatio),
        Math.round(-1 * position[1] * heightRatio)
      ];
      point2 = [
        Math.round(point1[0] + containerSize[0] * widthRatio),
        Math.round(point1[1] + containerSize[1] * heightRatio)
      ];

      coords = [point1, point2];

      if (transform) {
        coords = moveCoords(coords.map(function (coords) {
          coords = scaleCoords(coords, unifyDimensions(originalSize, transform.realSize), transform.realSize);

          if (transform.rotation) {
            coords = rotateCoords(coords, transform.realSize, -1 * transform.rotation);
          }
          return coords;
        }));
      }

      return coords;
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
     * @param {Number}  width
     * @param {Number}  height
     * @param {Boolean} [isZooming=false]
     * @returns {Array}  New size as [width, height].
     */
    resizeImage: function (width, height, isZooming) {
      var containerSize = getContainerSize.call(this),
          el = this.image[0],
          originalSize = getOriginalSize.call(this),
          aspectRatio = originalSize[0] / originalSize[1],
          newWidth = containerSize[0],
          newHeight = containerSize[1],
          minSize = this.opts.minSize,
          shouldReposition = true,
          maxRatio,
          containerRatio;

      // do not allow to upscale image by default
      if (!this.opts.upscale && (width > originalSize[0] || height > originalSize[1])) {
        width = originalSize[0];
        height = originalSize[1];
      }

      // do not exceed min. crop size if such is provided
      if (isZooming && minSize) {
        maxRatio = [originalSize[0] / minSize[0], originalSize[1] / minSize[1]];

        if (width / containerSize[0] > maxRatio[0] || height / containerSize[1] > maxRatio[1]) {
          containerRatio = [minSize[0] / containerSize[0], minSize[1] / containerSize[1]];

          width = originalSize[0] / containerRatio[0];
          height = originalSize[1] / containerRatio[1];
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
        newWidth = containerSize[0];
        newHeight = containerSize[1];

        if (width > height) {
          newWidth = containerSize[1] * aspectRatio;
        } else if (height > width) {
          newHeight = containerSize[0] / aspectRatio;
        }
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

      if (newSize = this.resizeImage(width, height, true)) {
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
   * Returns original (non-scaled) image size.
   *
   * @returns {Array}  Size as [width, height].
   */
  function getOriginalSize() {
    var data = this.image.dataset;

    return [data.originalWidth, data.originalHeight];
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
   * Scales coordinates.
   *
   * @param {Array}  coords    Coordinates to scale as [x, y].
   * @param {Array}  from      Current container size as [width, height].
   * @param {Array}  to        Target container size as [width, height].
   * @returns {Array}          Scaled coordinates as [x, y].
   */
  function scaleCoords(coords, from, to) {
    var widthRatio = to[0] / from[0],
        heightRatio = to[1] / from[1];

    return [coords[0] * widthRatio, coords[1] * heightRatio].map(Math.round);
  }

  /**
   * Rotates coordinates.
   *
   * @param {Array}  coords  Coordinates to rotate [x, y].
   * @param {Array}  size    Rotated container size as [width, height].
   * @param {Number} deg     Rotation degrees.
   * @returns {Array}        Rotated coordinates [x, y].
   */
  function rotateCoords(coords, size, deg) {
    var x = coords[0],
        y = coords[1],
        newX = x,
        newY = y,
        rad,
        sin,
        cos;

    deg %= 360;

    if (deg < 0) {
      deg += 360;
    }
    if (deg > 0) {
      rad = deg * Math.PI / 180;
      sin = Math.sin(rad);
      cos = Math.cos(rad);

      newX = x * cos - y * sin;
      newY = x * sin + y * cos;

      switch (deg) {
        case 90:
          newX += size[0];
          break;
        case 180:
          newX += size[0];
          newY += size[1];
          break;
        case 270:
          newY += size[1];
          break;
      }
    }
    return [newX, newY].map(Math.round);
  }

  /**
   * Makes sure that first point is at top left and second is at bottom right position.
   *
   * @param {Array} points  Two coordinate points to moves as [[x1, y1], [x2, y2]].
   * @returns {Array}       Moved coordinate points as [[x1, y1], [x2, y2]].
   */
  function moveCoords(points) {
    var x,
        y;

    if (points[0][0] > points[1][0]) {
      x = points[1][0];
      points[1][0] = points[0][0];
      points[0][0] = x;
    }
    if (points[0][1] > points[1][1]) {
      y = points[1][1];
      points[1][1] = points[0][1];
      points[0][1] = y;
    }

    return points;
  }

  /**
   * Unifies target dimensions' aspect ratio with source's.
   *
   * @param {Array} target  Target's dimensions to unify as [width, height].
   * @param {Array} source  Sources's dimensions to unify with [width, height].
   * @returns {Array}       Target's unified dimensions as [width, height].
   */
  function unifyDimensions(target, source) {
    var targetRatio = target[0] / target[1],
        sourceRatio = source[0] / source[1];

    if (targetRatio > 1 && sourceRatio > 1 || targetRatio < 1 && sourceRatio < 1) {
      return target;
    } else {
      return [target[1], target[0]];
    }
  }

  /**
   * Returns centered square's coords within container of provided size.
   *
   * @param {Array} size  Container's size as [width, height]
   * @returns {Array}     Coordinate points as [[x1, y1], [x2, y2]].
   */
  function getCenteredSquareCoords(size) {
    var centerCoords;

    if (size[0] > size[1]) {
      centerCoords = [
        [(size[0] - size[1]) / 2, 0].map(Math.round),
        [(size[0] + size[1]) / 2, size[1]].map(Math.round)
      ];
    } else if (size[1] > size[0]) {
      centerCoords = [
        [0, (size[1] - size[0]) / 2].map(Math.round),
        [size[0], (size[1] + size[0]) / 2].map(Math.round)
      ];
    } else {
      centerCoords = [[0, 0], size];
    }

    return centerCoords;
  }

  return Crop;

}));
