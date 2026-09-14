// Bundled by esbuild - agent-browser daemon
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/constants.js"(exports2, module2) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module2.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: Symbol("kIsForOnEventAttribute"),
      kListener: Symbol("kListener"),
      kStatusCode: Symbol("status-code"),
      kWebSocket: Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/buffer-util.js"(exports2, module2) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module2.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = require("bufferutil");
        module2.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module2.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/limiter.js"(exports2, module2) {
    "use strict";
    var kDone = Symbol("kDone");
    var kRun = Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module2.exports = Limiter;
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/permessage-deflate.js"(exports2, module2) {
    "use strict";
    var zlib = require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = Symbol("permessage-deflate");
    var kTotalLength = Symbol("total-length");
    var kCallback = Symbol("callback");
    var kBuffers = Symbol("buffers");
    var kError = Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       * @param {Boolean} [isServer=false] Create the instance in either server or
       *     client mode
       * @param {Number} [maxPayload=0] The maximum allowed message length
       */
      constructor(options, isServer, maxPayload) {
        this._maxPayload = maxPayload | 0;
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._isServer = !!isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && !params.client_max_window_bits) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module2.exports = PerMessageDeflate;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/validation.js"(exports2, module2) {
    "use strict";
    var { isUtf8 } = require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module2.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module2.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = require("utf-8-validate");
        module2.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/receiver.js"(exports2, module2) {
    "use strict";
    var { Writable } = require("stream");
    var PerMessageDeflate = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module2.exports = Receiver2;
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/sender.js"(exports2, module2) {
    "use strict";
    var { Duplex } = require("stream");
    var { randomFillSync } = require("crypto");
    var PerMessageDeflate = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else {
            buf.set(data, 2);
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module2.exports = Sender2;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/event-target.js"(exports2, module2) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = Symbol("kCode");
    var kData = Symbol("kData");
    var kError = Symbol("kError");
    var kMessage = Symbol("kMessage");
    var kReason = Symbol("kReason");
    var kTarget = Symbol("kTarget");
    var kType = Symbol("kType");
    var kWasClean = Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module2.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/extension.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension) => {
        let configurations = extensions[extension];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module2.exports = { format, parse };
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/websocket.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events");
    var https = require("https");
    var http = require("http");
    var net2 = require("net");
    var tls = require("tls");
    var { randomBytes: randomBytes3, createHash } = require("crypto");
    var { Duplex, Readable } = require("stream");
    var { URL: URL2 } = require("url");
    var PerMessageDeflate = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._closeTimeout = options.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate.extensionName]) {
          this._extensions[PerMessageDeflate.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module2.exports = WebSocket2;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      websocket._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL2) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL2(address);
        } catch (e) {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes3(16).toString("base64");
      const request = isSecure ? https.request : http.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate(
          opts.perMessageDeflate !== true ? opts.perMessageDeflate : {},
          false,
          opts.maxPayload
        );
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL2(location, address);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net2.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net2.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket2.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        websocket._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket2.CLOSING;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/stream.js"(exports2, module2) {
    "use strict";
    var WebSocket2 = require_websocket();
    var { Duplex } = require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream2(ws, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws.pause();
      });
      ws.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws.once("close", function close() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null) return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused) ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module2.exports = createWebSocketStream2;
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/subprotocol.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module2.exports = { parse };
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/websocket-server.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events");
    var http = require("http");
    var { Duplex } = require("stream");
    var { createHash } = require("crypto");
    var extension = require_extension();
    var PerMessageDeflate = require_permessage_deflate();
    var subprotocol = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket2,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http.createServer((req, res) => {
            const body = http.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate(
            this.options.perMessageDeflate,
            true,
            this.options.maxPayload
          );
          try {
            const offers = extension.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate.extensionName]);
              extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate.extensionName]) {
          const params = extensions[PerMessageDeflate.extensionName].params;
          const value = extension.format({
            [PerMessageDeflate.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req);
      }
    };
    module2.exports = WebSocketServer2;
    function addListeners(server, map) {
      for (const event of Object.keys(map)) server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers) {
      if (server.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// src/daemon.ts
var daemon_exports = {};
__export(daemon_exports, {
  cleanupSocket: () => cleanupSocket,
  getAppDir: () => getAppDir,
  getConnectionInfo: () => getConnectionInfo,
  getPidFile: () => getPidFile,
  getPortFile: () => getPortFile,
  getSession: () => getSession,
  getSocketDir: () => getSocketDir,
  getSocketPath: () => getSocketPath,
  getStreamPortFile: () => getStreamPortFile,
  isDaemonRunning: () => isDaemonRunning,
  safeWrite: () => safeWrite,
  setSession: () => setSession,
  startDaemon: () => startDaemon
});
module.exports = __toCommonJS(daemon_exports);
var net = __toESM(require("net"), 1);
var fs3 = __toESM(require("fs"), 1);
var path6 = __toESM(require("path"), 1);
var os5 = __toESM(require("os"), 1);

// src/browser.ts
var import_playwright_core = require("playwright-core");
var import_node_path2 = __toESM(require("node:path"), 1);
var import_node_os2 = __toESM(require("node:os"), 1);
var import_node_fs2 = require("node:fs");
var import_promises = require("node:fs/promises");

// src/snapshot.ts
var refCounter = 0;
function resetRefs() {
  refCounter = 0;
}
function nextRef() {
  return `e${++refCounter}`;
}
var INTERACTIVE_ROLES = /* @__PURE__ */ new Set([
  "button",
  "link",
  "textbox",
  "checkbox",
  "radio",
  "combobox",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "treeitem"
]);
var CONTENT_ROLES = /* @__PURE__ */ new Set([
  "heading",
  "cell",
  "gridcell",
  "columnheader",
  "rowheader",
  "listitem",
  "article",
  "region",
  "main",
  "navigation"
]);
var STRUCTURAL_ROLES = /* @__PURE__ */ new Set([
  "generic",
  "group",
  "list",
  "table",
  "row",
  "rowgroup",
  "grid",
  "treegrid",
  "menu",
  "menubar",
  "toolbar",
  "tablist",
  "tree",
  "directory",
  "document",
  "application",
  "presentation",
  "none"
]);
function buildSelector(role, name) {
  const escapedName = JSON.stringify(name);
  return `getByRole('${role}', { name: ${escapedName}, exact: true })`;
}
async function findCursorInteractiveElements(page2, selector) {
  const rootSelector = selector || "body";
  const scriptBody = `(rootSel) => {
    const results = [];

    // Elements that already have interactive ARIA roles - skip these
    const interactiveRoles = new Set([
      'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox',
      'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'searchbox',
      'slider', 'spinbutton', 'switch', 'tab', 'treeitem'
    ]);

    // Tags that are already interactive by default
    const interactiveTags = new Set([
      'a', 'button', 'input', 'select', 'textarea', 'details', 'summary'
    ]);

    const root = document.querySelector(rootSel) || document.body;
    const allElements = root.querySelectorAll('*');

    // Build a unique selector for an element
    const buildSelector = (el) => {
      const testId = el.getAttribute('data-testid');
      if (testId) return '[data-testid="' + testId + '"]';
      if (el.id) return '#' + CSS.escape(el.id);

      const path = [];
      let current = el;
      while (current && current !== document.body) {
        let sel = current.tagName.toLowerCase();
        const classes = Array.from(current.classList).filter(c => c.trim());
        if (classes.length > 0) sel += '.' + CSS.escape(classes[0]);

        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children);
          const matching = siblings.filter(s => {
            if (s.tagName !== current.tagName) return false;
            if (classes.length > 0 && !s.classList.contains(classes[0])) return false;
            return true;
          });
          if (matching.length > 1) {
            const idx = matching.indexOf(current) + 1;
            sel += ':nth-of-type(' + idx + ')';
          }
        }
        path.unshift(sel);
        current = current.parentElement;
        // Stop once the selector uniquely identifies the element (max 10 levels)
        if (path.length >= 1) {
          try {
            const candidate = path.join(' > ');
            if (document.querySelectorAll(candidate).length === 1) break;
          } catch (e) {
            // If selector is invalid, keep building
          }
        }
        if (path.length >= 10) break;
      }
      return path.join(' > ');
    };

    for (const el of allElements) {
      const tagName = el.tagName.toLowerCase();
      if (interactiveTags.has(tagName)) continue;

      const role = el.getAttribute('role');
      if (role && interactiveRoles.has(role.toLowerCase())) continue;

      const computedStyle = getComputedStyle(el);
      const hasCursorPointer = computedStyle.cursor === 'pointer';
      const hasOnClick = el.hasAttribute('onclick') || el.onclick !== null;
      const tabIndex = el.getAttribute('tabindex');
      const hasTabIndex = tabIndex !== null && tabIndex !== '-1';

      if (!hasCursorPointer && !hasOnClick && !hasTabIndex) continue;

      // Skip elements that only inherit cursor:pointer from an ancestor
      // (the ancestor itself will be captured instead)
      if (hasCursorPointer && !hasOnClick && !hasTabIndex) {
        const parent = el.parentElement;
        if (parent && getComputedStyle(parent).cursor === 'pointer') continue;
      }

      const text = (el.textContent || '').trim().slice(0, 100);
      if (!text) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      results.push({
        selector: buildSelector(el),
        text,
        tagName,
        hasOnClick,
        hasCursorPointer,
        hasTabIndex
      });
    }
    return results;
  }`;
  const fn2 = new Function("return " + scriptBody)();
  return page2.evaluate(fn2, rootSelector);
}
async function getEnhancedSnapshot(page2, options = {}) {
  resetRefs();
  const refs = {};
  const locator2 = options.selector ? page2.locator(options.selector) : page2.locator(":root");
  const ariaTree = await locator2.ariaSnapshot();
  if (!ariaTree) {
    return {
      tree: "(empty)",
      refs: {}
    };
  }
  const enhancedTree = processAriaTree(ariaTree, refs, options);
  if (options.cursor) {
    const cursorElements = await findCursorInteractiveElements(page2, options.selector);
    const existingTexts = new Set(Object.values(refs).map((r) => r.name.toLowerCase()));
    for (const m of enhancedTree.matchAll(/"([^"]+)"/g)) {
      existingTexts.add(m[1].toLowerCase());
    }
    const additionalLines = [];
    for (const el2 of cursorElements) {
      const elTextLower = el2.text.toLowerCase();
      if (existingTexts.has(elTextLower)) continue;
      existingTexts.add(elTextLower);
      const ref = nextRef();
      const role = el2.hasCursorPointer || el2.hasOnClick ? "clickable" : "focusable";
      refs[ref] = {
        selector: el2.selector,
        role,
        name: el2.text
      };
      const hints = [];
      if (el2.hasCursorPointer) hints.push("cursor:pointer");
      if (el2.hasOnClick) hints.push("onclick");
      if (el2.hasTabIndex) hints.push("tabindex");
      additionalLines.push(`- ${role} "${el2.text}" [ref=${ref}] [${hints.join(", ")}]`);
    }
    if (additionalLines.length > 0) {
      const separator = enhancedTree === "(no interactive elements)" ? "" : "\n# Cursor-interactive elements:\n";
      const base = enhancedTree === "(no interactive elements)" ? "" : enhancedTree;
      return {
        tree: base + separator + additionalLines.join("\n"),
        refs
      };
    }
  }
  return { tree: enhancedTree, refs };
}
function createRoleNameTracker() {
  const counts = /* @__PURE__ */ new Map();
  const refsByKey = /* @__PURE__ */ new Map();
  return {
    counts,
    refsByKey,
    getKey(role, name) {
      return `${role}:${name ?? ""}`;
    },
    getNextIndex(role, name) {
      const key = this.getKey(role, name);
      const current = counts.get(key) ?? 0;
      counts.set(key, current + 1);
      return current;
    },
    trackRef(role, name, ref) {
      const key = this.getKey(role, name);
      const refs = refsByKey.get(key) ?? [];
      refs.push(ref);
      refsByKey.set(key, refs);
    },
    getDuplicateKeys() {
      const duplicates = /* @__PURE__ */ new Set();
      for (const [key, refs] of refsByKey) {
        if (refs.length > 1) {
          duplicates.add(key);
        }
      }
      return duplicates;
    }
  };
}
function processAriaTree(ariaTree, refs, options) {
  const lines = ariaTree.split("\n");
  const result = [];
  const tracker = createRoleNameTracker();
  if (options.interactive) {
    for (const line of lines) {
      const match = line.match(/^(\s*-\s*)(\w+)(?:\s+"([^"]*)")?(.*)$/);
      if (!match) continue;
      const [, , role, name, suffix] = match;
      const roleLower = role.toLowerCase();
      if (INTERACTIVE_ROLES.has(roleLower)) {
        const ref = nextRef();
        const resolvedName = name ?? "";
        const nth = tracker.getNextIndex(roleLower, resolvedName);
        tracker.trackRef(roleLower, resolvedName, ref);
        refs[ref] = {
          selector: buildSelector(roleLower, resolvedName),
          role: roleLower,
          name: resolvedName,
          nth
          // Always store nth, we'll use it for duplicates
        };
        let enhanced = `- ${role}`;
        if (name) enhanced += ` "${name}"`;
        enhanced += ` [ref=${ref}]`;
        if (nth > 0) enhanced += ` [nth=${nth}]`;
        if (suffix && suffix.includes("[")) enhanced += suffix;
        result.push(enhanced);
      }
    }
    removeNthFromNonDuplicates(refs, tracker);
    return result.join("\n") || "(no interactive elements)";
  }
  for (const line of lines) {
    const processed = processLine(line, refs, options, tracker);
    if (processed !== null) {
      result.push(processed);
    }
  }
  removeNthFromNonDuplicates(refs, tracker);
  if (options.compact) {
    return compactTree(result.join("\n"));
  }
  return result.join("\n");
}
function removeNthFromNonDuplicates(refs, tracker) {
  const duplicateKeys = tracker.getDuplicateKeys();
  for (const [ref, data] of Object.entries(refs)) {
    const key = tracker.getKey(data.role, data.name);
    if (!duplicateKeys.has(key)) {
      delete refs[ref].nth;
    }
  }
}
function getIndentLevel(line) {
  const match = line.match(/^(\s*)/);
  return match ? Math.floor(match[1].length / 2) : 0;
}
function processLine(line, refs, options, tracker) {
  const depth = getIndentLevel(line);
  if (options.maxDepth !== void 0 && depth > options.maxDepth) {
    return null;
  }
  const match = line.match(/^(\s*-\s*)(\w+)(?:\s+"([^"]*)")?(.*)$/);
  if (!match) {
    if (options.interactive) {
      return null;
    }
    return line;
  }
  const [, prefix, role, name, suffix] = match;
  const roleLower = role.toLowerCase();
  if (role.startsWith("/")) {
    return line;
  }
  const isInteractive = INTERACTIVE_ROLES.has(roleLower);
  const isContent = CONTENT_ROLES.has(roleLower);
  const isStructural = STRUCTURAL_ROLES.has(roleLower);
  if (options.interactive && !isInteractive) {
    return null;
  }
  if (options.compact && isStructural && !name) {
    return null;
  }
  const shouldHaveRef = isInteractive || isContent && name;
  if (shouldHaveRef) {
    const ref = nextRef();
    const resolvedName = isInteractive ? name ?? "" : name;
    const nth = tracker.getNextIndex(roleLower, resolvedName);
    tracker.trackRef(roleLower, resolvedName, ref);
    refs[ref] = {
      selector: buildSelector(roleLower, resolvedName),
      role: roleLower,
      name: resolvedName,
      nth
      // Always store nth, we'll clean up non-duplicates later
    };
    let enhanced = `${prefix}${role}`;
    if (name) enhanced += ` "${name}"`;
    enhanced += ` [ref=${ref}]`;
    if (nth > 0) enhanced += ` [nth=${nth}]`;
    if (suffix) enhanced += suffix;
    return enhanced;
  }
  return line;
}
function compactTree(tree) {
  const lines = tree.split("\n");
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("[ref=")) {
      result.push(line);
      continue;
    }
    if (line.includes(":") && !line.endsWith(":")) {
      result.push(line);
      continue;
    }
    const currentIndent = getIndentLevel(line);
    let hasRelevantChildren = false;
    for (let j = i + 1; j < lines.length; j++) {
      const childIndent = getIndentLevel(lines[j]);
      if (childIndent <= currentIndent) break;
      if (lines[j].includes("[ref=")) {
        hasRelevantChildren = true;
        break;
      }
    }
    if (hasRelevantChildren) {
      result.push(line);
    }
  }
  return result.join("\n");
}
function parseRef(arg) {
  if (arg.startsWith("@")) {
    return arg.slice(1);
  }
  if (arg.startsWith("ref=")) {
    return arg.slice(4);
  }
  if (/^e\d+$/.test(arg)) {
    return arg;
  }
  return null;
}

// src/state-utils.ts
var fs = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);
var os2 = __toESM(require("os"), 1);

// src/encryption.ts
var crypto = __toESM(require("crypto"), 1);
var import_node_child_process = require("node:child_process");
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
var import_node_os = __toESM(require("node:os"), 1);
var ENCRYPTION_ALGORITHM = "aes-256-gcm";
var ENCRYPTION_KEY_ENV = "AGENT_BROWSER_ENCRYPTION_KEY";
var IV_LENGTH = 12;
var KEY_FILE_NAME = ".encryption-key";
function getKeyFilePath() {
  return (0, import_node_path.join)(import_node_os.default.homedir(), ".agent-browser", KEY_FILE_NAME);
}
function restrictFilePermissions(filePath) {
  if (import_node_os.default.platform() !== "win32") return;
  try {
    (0, import_node_child_process.execSync)(`icacls "${filePath}" /inheritance:r /grant:r "%USERNAME%:F"`, {
      stdio: "ignore",
      windowsHide: true
    });
  } catch {
  }
}
function restrictDirPermissions(dirPath) {
  if (import_node_os.default.platform() !== "win32") return;
  try {
    (0, import_node_child_process.execSync)(`icacls "${dirPath}" /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F"`, {
      stdio: "ignore",
      windowsHide: true
    });
  } catch {
  }
}
function parseKeyHex(keyHex) {
  if (!/^[a-fA-F0-9]{64}$/.test(keyHex.trim())) return null;
  return Buffer.from(keyHex.trim(), "hex");
}
function getEncryptionKey() {
  const keyHex = process.env[ENCRYPTION_KEY_ENV];
  if (keyHex) {
    const key = parseKeyHex(keyHex);
    if (!key) {
      console.warn(
        `Warning: ${ENCRYPTION_KEY_ENV} should be a 64-character hex string (256 bits). Generate one with: openssl rand -hex 32`
      );
      return null;
    }
    return key;
  }
  const keyFilePath = getKeyFilePath();
  if ((0, import_node_fs.existsSync)(keyFilePath)) {
    try {
      const fileHex = (0, import_node_fs.readFileSync)(keyFilePath, "utf-8");
      return parseKeyHex(fileHex);
    } catch {
      return null;
    }
  }
  return null;
}
function ensureEncryptionKey() {
  const existing = getEncryptionKey();
  if (existing) return existing;
  const key = crypto.randomBytes(32);
  const keyHex = key.toString("hex");
  const dir = (0, import_node_path.join)(import_node_os.default.homedir(), ".agent-browser");
  if (!(0, import_node_fs.existsSync)(dir)) {
    (0, import_node_fs.mkdirSync)(dir, { recursive: true, mode: 448 });
    restrictDirPermissions(dir);
  }
  const keyFilePath = getKeyFilePath();
  (0, import_node_fs.writeFileSync)(keyFilePath, keyHex + "\n", { mode: 384 });
  restrictFilePermissions(keyFilePath);
  console.error(
    `[agent-browser] Auto-generated encryption key at ${keyFilePath} -- back up this file or set ${ENCRYPTION_KEY_ENV}`
  );
  return key;
}
function encryptData(plaintext, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return {
    version: 1,
    encrypted: true,
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64")
  };
}
function decryptData(payload, key) {
  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const encryptedData = Buffer.from(payload.data, "base64");
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedData);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString("utf8");
}
function isEncryptedPayload(data) {
  return typeof data === "object" && data !== null && "encrypted" in data && data.encrypted === true && "version" in data && "iv" in data && "authTag" in data && "data" in data;
}

// src/state-utils.ts
function getSessionsDir() {
  return path.join(os2.homedir(), ".agent-browser", "sessions");
}
function ensureSessionsDir() {
  const sessionsDir = getSessionsDir();
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true, mode: 448 });
  }
  return sessionsDir;
}
function isValidSessionId(id) {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}
function isValidSessionName(name) {
  return /^[a-zA-Z0-9_-]+$/.test(name);
}
function getAutoStateFilePath(sessionName, sessionId) {
  if (!sessionName) return null;
  if (!isValidSessionName(sessionName)) {
    throw new Error(
      `Invalid session name '${sessionName}'. Only alphanumeric characters, hyphens, and underscores are allowed.`
    );
  }
  if (!isValidSessionId(sessionId)) {
    throw new Error(
      `Invalid session ID '${sessionId}'. Only alphanumeric characters, hyphens, and underscores are allowed.`
    );
  }
  const sessionsDir = ensureSessionsDir();
  return path.join(sessionsDir, `${sessionName}-${sessionId}.json`);
}
function readStateFile(filepath) {
  const content = fs.readFileSync(filepath, "utf-8");
  const parsed = JSON.parse(content);
  if (isEncryptedPayload(parsed)) {
    const key = getEncryptionKey();
    if (!key) {
      throw new Error(
        `State file is encrypted but ${ENCRYPTION_KEY_ENV} is not set. Set the environment variable to decrypt.`
      );
    }
    const decrypted = decryptData(parsed, key);
    return { data: JSON.parse(decrypted), wasEncrypted: true };
  }
  return { data: parsed, wasEncrypted: false };
}
function listStateFiles() {
  const sessionsDir = getSessionsDir();
  if (!fs.existsSync(sessionsDir)) {
    return [];
  }
  return fs.readdirSync(sessionsDir).filter((f) => f.endsWith(".json"));
}
function cleanupExpiredStates(days) {
  if (days <= 0) return [];
  const sessionsDir = getSessionsDir();
  if (!fs.existsSync(sessionsDir)) {
    return [];
  }
  const now = Date.now();
  const maxAge = days * 24 * 60 * 60 * 1e3;
  const deleted = [];
  const files = listStateFiles();
  for (const file of files) {
    const filepath = path.join(sessionsDir, file);
    try {
      const stats = fs.statSync(filepath);
      if (now - stats.mtime.getTime() > maxAge) {
        fs.unlinkSync(filepath);
        deleted.push(file);
      }
    } catch {
    }
  }
  return deleted;
}
var DANGEROUS_KEYS = ["__proto__", "constructor", "prototype"];
function safeHeaderMerge(base, override) {
  const result = /* @__PURE__ */ Object.create(null);
  for (const [key, value] of Object.entries(base)) {
    if (!DANGEROUS_KEYS.includes(key)) {
      result[key] = value;
    }
  }
  for (const [key, value] of Object.entries(override)) {
    if (!DANGEROUS_KEYS.includes(key)) {
      result[key] = value;
    }
  }
  return result;
}

// src/domain-filter.ts
function isDomainAllowed(hostname, allowedDomains) {
  for (const pattern of allowedDomains) {
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(1);
      if (hostname === pattern.slice(2) || hostname.endsWith(suffix)) {
        return true;
      }
    } else if (hostname === pattern) {
      return true;
    }
  }
  return false;
}
function parseDomainList(raw) {
  return raw.split(",").map((d) => d.trim().toLowerCase()).filter((d) => d.length > 0);
}
function buildWebSocketFilterScript(allowedDomains) {
  const serialized = JSON.stringify(allowedDomains);
  return `(function() {
  var _allowedDomains = ${serialized};
  function _isDomainAllowed(hostname) {
    hostname = hostname.toLowerCase();
    for (var i = 0; i < _allowedDomains.length; i++) {
      var pattern = _allowedDomains[i];
      if (pattern.indexOf('*.') === 0) {
        var suffix = pattern.slice(1);
        if (hostname === pattern.slice(2) || hostname.slice(-suffix.length) === suffix) {
          return true;
        }
      } else if (hostname === pattern) {
        return true;
      }
    }
    return false;
  }
  function _checkUrl(url) {
    try {
      var parsed = new URL(url);
      return _isDomainAllowed(parsed.hostname);
    } catch(e) {
      return false;
    }
  }
  if (typeof WebSocket !== 'undefined') {
    var _OrigWS = WebSocket;
    WebSocket = function(url, protocols) {
      if (!_checkUrl(url)) {
        throw new DOMException(
          'WebSocket connection to ' + url + ' blocked by domain allowlist',
          'SecurityError'
        );
      }
      if (protocols !== undefined) {
        return new _OrigWS(url, protocols);
      }
      return new _OrigWS(url);
    };
    WebSocket.prototype = _OrigWS.prototype;
    WebSocket.CONNECTING = _OrigWS.CONNECTING;
    WebSocket.OPEN = _OrigWS.OPEN;
    WebSocket.CLOSING = _OrigWS.CLOSING;
    WebSocket.CLOSED = _OrigWS.CLOSED;
  }
  if (typeof EventSource !== 'undefined') {
    var _OrigES = EventSource;
    EventSource = function(url, opts) {
      if (!_checkUrl(url)) {
        throw new DOMException(
          'EventSource connection to ' + url + ' blocked by domain allowlist',
          'SecurityError'
        );
      }
      return new _OrigES(url, opts);
    };
    EventSource.prototype = _OrigES.prototype;
    EventSource.CONNECTING = _OrigES.CONNECTING;
    EventSource.OPEN = _OrigES.OPEN;
    EventSource.CLOSED = _OrigES.CLOSED;
  }
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    var _origSendBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function(url, data) {
      if (!_checkUrl(url)) {
        return false;
      }
      return _origSendBeacon(url, data);
    };
  }
})();`;
}
async function installDomainFilter(context, allowedDomains) {
  if (allowedDomains.length === 0) return;
  await context.addInitScript(buildWebSocketFilterScript(allowedDomains));
  await context.route("**/*", async (route) => {
    const request = route.request();
    const urlStr = request.url();
    if (!urlStr.startsWith("http://") && !urlStr.startsWith("https://")) {
      if (request.resourceType() === "document") {
        await route.abort("blockedbyclient");
      } else {
        await route.continue();
      }
      return;
    }
    let hostname;
    try {
      hostname = new URL(urlStr).hostname.toLowerCase();
    } catch {
      await route.abort("blockedbyclient");
      return;
    }
    if (isDomainAllowed(hostname, allowedDomains)) {
      await route.continue();
    } else {
      await route.abort("blockedbyclient");
    }
  });
}

// src/browser.ts
function getDefaultTimeout() {
  const envValue = process.env.AGENT_BROWSER_DEFAULT_TIMEOUT;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed >= 1e3) {
      return parsed;
    }
  }
  return 25e3;
}
var BrowserManager = class _BrowserManager {
  browser = null;
  cdpEndpoint = null;
  // stores port number or full URL
  isPersistentContext = false;
  browserbaseSessionId = null;
  browserbaseApiKey = null;
  browserUseSessionId = null;
  browserUseApiKey = null;
  kernelSessionId = null;
  kernelApiKey = null;
  contexts = [];
  pages = [];
  activePageIndex = 0;
  activeFrame = null;
  dialogHandler = null;
  trackedRequests = [];
  routes = /* @__PURE__ */ new Map();
  consoleMessages = [];
  pageErrors = [];
  isRecordingHar = false;
  refMap = {};
  lastSnapshot = "";
  scopedHeaderRoutes = /* @__PURE__ */ new Map();
  colorScheme = null;
  downloadPath = null;
  allowedDomains = [];
  /**
   * Set the persistent color scheme preference.
   * Applied automatically to all new pages and contexts.
   */
  setColorScheme(scheme) {
    this.colorScheme = scheme;
  }
  // CDP session for screencast and input injection
  cdpSession = null;
  screencastActive = false;
  screencastSessionId = 0;
  frameCallback = null;
  screencastFrameHandler = null;
  // Video recording (Playwright native)
  recordingContext = null;
  recordingPage = null;
  recordingOutputPath = "";
  recordingTempDir = "";
  launchWarnings = [];
  /**
   * Get and clear launch warnings (e.g., decryption failures)
   */
  getAndClearWarnings() {
    const warnings = this.launchWarnings;
    this.launchWarnings = [];
    return warnings;
  }
  // CDP profiling state
  static MAX_PROFILE_EVENTS = 5e6;
  profilingActive = false;
  profileChunks = [];
  profileEventsDropped = false;
  profileCompleteResolver = null;
  profileDataHandler = null;
  profileCompleteHandler = null;
  /**
   * Check if browser is launched
   */
  isLaunched() {
    return this.browser !== null || this.isPersistentContext;
  }
  /**
   * Get enhanced snapshot with refs and cache the ref map
   */
  async getSnapshot(options) {
    const page2 = this.getPage();
    const snapshot = await getEnhancedSnapshot(page2, options);
    this.refMap = snapshot.refs;
    this.lastSnapshot = snapshot.tree;
    return snapshot;
  }
  /**
   * Get the last snapshot tree text (empty string if no snapshot has been taken)
   */
  getLastSnapshot() {
    return this.lastSnapshot;
  }
  /**
   * Update the stored snapshot (used by diff to keep the baseline current)
   */
  setLastSnapshot(snapshot) {
    this.lastSnapshot = snapshot;
  }
  /**
   * Get the cached ref map from last snapshot
   */
  getRefMap() {
    return this.refMap;
  }
  /**
   * Get a locator from a ref (e.g., "e1", "@e1", "ref=e1")
   * Returns null if ref doesn't exist or is invalid
   */
  getLocatorFromRef(refArg) {
    const ref = parseRef(refArg);
    if (!ref) return null;
    const refData = this.refMap[ref];
    if (!refData) return null;
    const page2 = this.getPage();
    if (refData.role === "clickable" || refData.role === "focusable") {
      return page2.locator(refData.selector);
    }
    let locator2 = page2.getByRole(refData.role, {
      name: refData.name,
      exact: true
    });
    if (refData.nth !== void 0) {
      locator2 = locator2.nth(refData.nth);
    }
    return locator2;
  }
  /**
   * Check if a selector looks like a ref
   */
  isRef(selector) {
    return parseRef(selector) !== null;
  }
  /**
   * Install the domain filter on a context if an allowlist is configured.
   * Should be called before any pages navigate on the context.
   */
  async ensureDomainFilter(context) {
    if (this.allowedDomains.length > 0) {
      await installDomainFilter(context, this.allowedDomains);
    }
  }
  /**
   * After installing the domain filter, verify existing pages are on allowed
   * domains. Pages that pre-date the filter (e.g. CDP/cloud connect) may have
   * already navigated to disallowed domains. Navigate them to about:blank.
   */
  async sanitizeExistingPages(pages) {
    if (this.allowedDomains.length === 0) return;
    for (const page2 of pages) {
      const url = page2.url();
      if (!url || url === "about:blank") continue;
      try {
        const hostname = new URL(url).hostname.toLowerCase();
        if (!isDomainAllowed(hostname, this.allowedDomains)) {
          await page2.goto("about:blank");
        }
      } catch {
        await page2.goto("about:blank").catch(() => {
        });
      }
    }
  }
  /**
   * Check if a URL is allowed by the domain allowlist.
   * Throws if the URL's domain is blocked. No-op if no allowlist is set.
   * Blocks non-http(s) schemes and unparseable URLs by default.
   */
  checkDomainAllowed(url) {
    if (this.allowedDomains.length === 0) return;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      throw new Error(`Navigation blocked: non-http(s) scheme in URL "${url}"`);
    }
    let hostname;
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      throw new Error(`Navigation blocked: unable to parse URL "${url}"`);
    }
    if (!isDomainAllowed(hostname, this.allowedDomains)) {
      throw new Error(`Navigation blocked: ${hostname} is not in the allowed domains list`);
    }
  }
  /**
   * Get locator - supports both refs and regular selectors
   */
  getLocator(selectorOrRef) {
    const locator2 = this.getLocatorFromRef(selectorOrRef);
    if (locator2) return locator2;
    const page2 = this.getPage();
    return page2.locator(selectorOrRef);
  }
  /**
   * Check if the browser has any usable pages
   */
  hasPages() {
    return this.pages.length > 0;
  }
  /**
   * Ensure at least one page exists. If the browser is launched but all pages
   * were closed (stale session), creates a new page on the existing context.
   * No-op if pages already exist.
   */
  async ensurePage() {
    if (this.pages.length > 0) return;
    if (!this.browser && !this.isPersistentContext) return;
    let context;
    if (this.contexts.length > 0) {
      context = this.contexts[this.contexts.length - 1];
    } else if (this.browser) {
      context = await this.browser.newContext({
        ...this.colorScheme && { colorScheme: this.colorScheme }
      });
      context.setDefaultTimeout(getDefaultTimeout());
      this.contexts.push(context);
      this.setupContextTracking(context);
      await this.ensureDomainFilter(context);
    } else {
      return;
    }
    const page2 = await context.newPage();
    if (!this.pages.includes(page2)) {
      this.pages.push(page2);
      this.setupPageTracking(page2);
    }
    this.activePageIndex = this.pages.length - 1;
  }
  /**
   * Get the current active page, throws if not launched
   */
  getPage() {
    if (this.pages.length === 0) {
      throw new Error("Browser not launched. Call launch first.");
    }
    return this.pages[this.activePageIndex];
  }
  /**
   * Get the current frame (or page's main frame if no frame is selected)
   */
  getFrame() {
    if (this.activeFrame) {
      return this.activeFrame;
    }
    return this.getPage().mainFrame();
  }
  /**
   * Get the configured download directory path, or null if not set
   */
  getDownloadPath() {
    return this.downloadPath;
  }
  /**
   * Switch to a frame by selector, name, or URL
   */
  async switchToFrame(options) {
    const page2 = this.getPage();
    if (options.selector) {
      const frameElement = await page2.$(options.selector);
      if (!frameElement) {
        throw new Error(`Frame not found: ${options.selector}`);
      }
      const frame = await frameElement.contentFrame();
      if (!frame) {
        throw new Error(`Element is not a frame: ${options.selector}`);
      }
      this.activeFrame = frame;
    } else if (options.name) {
      const frame = page2.frame({ name: options.name });
      if (!frame) {
        throw new Error(`Frame not found with name: ${options.name}`);
      }
      this.activeFrame = frame;
    } else if (options.url) {
      const frame = page2.frame({ url: options.url });
      if (!frame) {
        throw new Error(`Frame not found with URL: ${options.url}`);
      }
      this.activeFrame = frame;
    }
  }
  /**
   * Switch back to main frame
   */
  switchToMainFrame() {
    this.activeFrame = null;
  }
  /**
   * Set up dialog handler
   */
  setDialogHandler(response, promptText) {
    const page2 = this.getPage();
    if (this.dialogHandler) {
      page2.removeListener("dialog", this.dialogHandler);
    }
    this.dialogHandler = async (dialog) => {
      if (response === "accept") {
        await dialog.accept(promptText);
      } else {
        await dialog.dismiss();
      }
    };
    page2.on("dialog", this.dialogHandler);
  }
  /**
   * Clear dialog handler
   */
  clearDialogHandler() {
    if (this.dialogHandler) {
      const page2 = this.getPage();
      page2.removeListener("dialog", this.dialogHandler);
      this.dialogHandler = null;
    }
  }
  /**
   * Start tracking requests
   */
  startRequestTracking() {
    const page2 = this.getPage();
    page2.on("request", (request) => {
      this.trackedRequests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        timestamp: Date.now(),
        resourceType: request.resourceType()
      });
    });
  }
  /**
   * Get tracked requests
   */
  getRequests(filter) {
    if (filter) {
      return this.trackedRequests.filter((r) => r.url.includes(filter));
    }
    return this.trackedRequests;
  }
  /**
   * Clear tracked requests
   */
  clearRequests() {
    this.trackedRequests = [];
  }
  /**
   * Add a route to intercept requests
   */
  async addRoute(url, options) {
    const page2 = this.getPage();
    const handler = async (route) => {
      if (options.abort) {
        await route.abort();
      } else if (options.response) {
        await route.fulfill({
          status: options.response.status ?? 200,
          body: options.response.body ?? "",
          contentType: options.response.contentType ?? "text/plain",
          headers: options.response.headers
        });
      } else {
        await route.continue();
      }
    };
    this.routes.set(url, handler);
    await page2.route(url, handler);
  }
  /**
   * Remove a route
   */
  async removeRoute(url) {
    const page2 = this.getPage();
    if (url) {
      const handler = this.routes.get(url);
      if (handler) {
        await page2.unroute(url, handler);
        this.routes.delete(url);
      }
    } else {
      for (const [routeUrl, handler] of this.routes) {
        await page2.unroute(routeUrl, handler);
      }
      this.routes.clear();
    }
  }
  /**
   * Set geolocation
   */
  async setGeolocation(latitude, longitude, accuracy) {
    const context = this.contexts[0];
    if (context) {
      await context.setGeolocation({ latitude, longitude, accuracy });
    }
  }
  /**
   * Set permissions
   */
  async setPermissions(permissions, grant) {
    const context = this.contexts[0];
    if (context) {
      if (grant) {
        await context.grantPermissions(permissions);
      } else {
        await context.clearPermissions();
      }
    }
  }
  /**
   * Set viewport
   */
  async setViewport(width, height) {
    const page2 = this.getPage();
    await page2.setViewportSize({ width, height });
  }
  /**
   * Set device scale factor (devicePixelRatio) via CDP
   * This sets window.devicePixelRatio which affects how the page renders and responds to media queries
   *
   * Note: When using CDP to set deviceScaleFactor, screenshots will be at logical pixel dimensions
   * (viewport size), not physical pixel dimensions (viewport × scale). This is a Playwright limitation
   * when using CDP emulation on existing contexts. For true HiDPI screenshots with physical pixels,
   * deviceScaleFactor must be set at context creation time.
   *
   * Must be called after setViewport to work correctly
   */
  async setDeviceScaleFactor(deviceScaleFactor, width, height, mobile = false) {
    const cdp = await this.getCDPSession();
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor,
      mobile
    });
  }
  /**
   * Clear device metrics override to restore default devicePixelRatio
   */
  async clearDeviceMetricsOverride() {
    const cdp = await this.getCDPSession();
    await cdp.send("Emulation.clearDeviceMetricsOverride");
  }
  /**
   * Get device descriptor
   */
  getDevice(deviceName) {
    return import_playwright_core.devices[deviceName];
  }
  /**
   * List available devices
   */
  listDevices() {
    return Object.keys(import_playwright_core.devices);
  }
  /**
   * Start console message tracking
   */
  startConsoleTracking() {
    const page2 = this.getPage();
    page2.on("console", (msg) => {
      this.consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: Date.now()
      });
    });
  }
  /**
   * Get console messages
   */
  getConsoleMessages() {
    return this.consoleMessages;
  }
  /**
   * Clear console messages
   */
  clearConsoleMessages() {
    this.consoleMessages = [];
  }
  /**
   * Start error tracking
   */
  startErrorTracking() {
    const page2 = this.getPage();
    page2.on("pageerror", (error) => {
      this.pageErrors.push({
        message: error.message,
        timestamp: Date.now()
      });
    });
  }
  /**
   * Get page errors
   */
  getPageErrors() {
    return this.pageErrors;
  }
  /**
   * Clear page errors
   */
  clearPageErrors() {
    this.pageErrors = [];
  }
  /**
   * Start HAR recording
   */
  async startHarRecording() {
    this.isRecordingHar = true;
  }
  /**
   * Check if HAR recording
   */
  isHarRecording() {
    return this.isRecordingHar;
  }
  /**
   * Set offline mode
   */
  async setOffline(offline) {
    const context = this.contexts[0];
    if (context) {
      await context.setOffline(offline);
    }
  }
  /**
   * Set extra HTTP headers (global - all requests)
   */
  async setExtraHeaders(headers) {
    const context = this.contexts[0];
    if (context) {
      await context.setExtraHTTPHeaders(headers);
    }
  }
  /**
   * Set scoped HTTP headers (only for requests matching the origin)
   * Uses route interception to add headers only to matching requests
   */
  async setScopedHeaders(origin, headers) {
    const page2 = this.getPage();
    let urlPattern;
    try {
      const url = new URL(origin.startsWith("http") ? origin : `https://${origin}`);
      urlPattern = `**://${url.host}/**`;
    } catch {
      urlPattern = `**://${origin}/**`;
    }
    const existingHandler = this.scopedHeaderRoutes.get(urlPattern);
    if (existingHandler) {
      await page2.unroute(urlPattern, existingHandler);
    }
    const handler = async (route) => {
      const requestHeaders = route.request().headers();
      await route.continue({
        headers: safeHeaderMerge(requestHeaders, headers)
      });
    };
    this.scopedHeaderRoutes.set(urlPattern, handler);
    await page2.route(urlPattern, handler);
  }
  /**
   * Clear scoped headers for an origin (or all if no origin specified)
   */
  async clearScopedHeaders(origin) {
    const page2 = this.getPage();
    if (origin) {
      let urlPattern;
      try {
        const url = new URL(origin.startsWith("http") ? origin : `https://${origin}`);
        urlPattern = `**://${url.host}/**`;
      } catch {
        urlPattern = `**://${origin}/**`;
      }
      const handler = this.scopedHeaderRoutes.get(urlPattern);
      if (handler) {
        await page2.unroute(urlPattern, handler);
        this.scopedHeaderRoutes.delete(urlPattern);
      }
    } else {
      for (const [pattern, handler] of this.scopedHeaderRoutes) {
        await page2.unroute(pattern, handler);
      }
      this.scopedHeaderRoutes.clear();
    }
  }
  /**
   * Start tracing
   */
  async startTracing(options) {
    const context = this.contexts[0];
    if (context) {
      await context.tracing.start({
        screenshots: options.screenshots ?? true,
        snapshots: options.snapshots ?? true
      });
    }
  }
  /**
   * Stop tracing and save
   */
  async stopTracing(path7) {
    const context = this.contexts[0];
    if (context) {
      await context.tracing.stop(path7 ? { path: path7 } : void 0);
    }
  }
  /**
   * Get the current browser context (first context)
   */
  getContext() {
    return this.contexts[0] ?? null;
  }
  /**
   * Save storage state (cookies, localStorage, etc.)
   */
  async saveStorageState(path7) {
    const context = this.contexts[0];
    if (context) {
      await context.storageState({ path: path7 });
    }
  }
  /**
   * Get all pages
   */
  getPages() {
    return this.pages;
  }
  /**
   * Get current page index
   */
  getActiveIndex() {
    return this.activePageIndex;
  }
  /**
   * Get the current browser instance
   */
  getBrowser() {
    return this.browser;
  }
  /**
   * Check if an existing CDP connection is still alive
   * by verifying we can access browser contexts and that at least one has pages
   */
  isCdpConnectionAlive() {
    if (!this.browser) return false;
    try {
      const contexts = this.browser.contexts();
      if (contexts.length === 0) return false;
      return contexts.some((context) => context.pages().length > 0);
    } catch {
      return false;
    }
  }
  /**
   * Check if CDP connection needs to be re-established
   */
  needsCdpReconnect(cdpEndpoint) {
    if (!this.browser?.isConnected()) return true;
    if (this.cdpEndpoint !== cdpEndpoint) return true;
    if (!this.isCdpConnectionAlive()) return true;
    return false;
  }
  /**
   * Close a Browserbase session via API
   */
  async closeBrowserbaseSession(sessionId, apiKey) {
    await fetch(`https://api.browserbase.com/v1/sessions/${sessionId}`, {
      method: "DELETE",
      headers: {
        "X-BB-API-Key": apiKey
      }
    });
  }
  /**
   * Close a Browser Use session via API
   */
  async closeBrowserUseSession(sessionId, apiKey) {
    const response = await fetch(`https://api.browser-use.com/api/v2/browsers/${sessionId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Browser-Use-API-Key": apiKey
      },
      body: JSON.stringify({ action: "stop" })
    });
    if (!response.ok) {
      throw new Error(`Failed to close Browser Use session: ${response.statusText}`);
    }
  }
  /**
   * Close a Kernel session via API
   */
  async closeKernelSession(sessionId, apiKey) {
    const response = await fetch(`https://api.onkernel.com/browsers/${sessionId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to close Kernel session: ${response.statusText}`);
    }
  }
  /**
   * Connect to Browserbase remote browser via CDP.
   * Requires BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID environment variables.
   */
  async connectToBrowserbase() {
    const browserbaseApiKey = process.env.BROWSERBASE_API_KEY;
    const browserbaseProjectId = process.env.BROWSERBASE_PROJECT_ID;
    if (!browserbaseApiKey || !browserbaseProjectId) {
      throw new Error(
        "BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID are required when using browserbase as a provider"
      );
    }
    const response = await fetch("https://api.browserbase.com/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BB-API-Key": browserbaseApiKey
      },
      body: JSON.stringify({
        projectId: browserbaseProjectId
      })
    });
    if (!response.ok) {
      throw new Error(`Failed to create Browserbase session: ${response.statusText}`);
    }
    const session = await response.json();
    const browser2 = await import_playwright_core.chromium.connectOverCDP(session.connectUrl).catch(() => {
      throw new Error("Failed to connect to Browserbase session via CDP");
    });
    try {
      const contexts = browser2.contexts();
      if (contexts.length === 0) {
        throw new Error("No browser context found in Browserbase session");
      }
      const context = contexts[0];
      const pages = context.pages();
      const page2 = pages[0] ?? await context.newPage();
      this.browserbaseSessionId = session.id;
      this.browserbaseApiKey = browserbaseApiKey;
      this.browser = browser2;
      context.setDefaultTimeout(1e4);
      this.contexts.push(context);
      this.setupContextTracking(context);
      await this.ensureDomainFilter(context);
      await this.sanitizeExistingPages([page2]);
      this.pages.push(page2);
      this.activePageIndex = 0;
      this.setupPageTracking(page2);
    } catch (error) {
      await this.closeBrowserbaseSession(session.id, browserbaseApiKey).catch((sessionError) => {
        console.error("Failed to close Browserbase session during cleanup:", sessionError);
      });
      throw error;
    }
  }
  /**
   * Find or create a Kernel profile by name.
   * Returns the profile object if successful.
   */
  async findOrCreateKernelProfile(profileName, apiKey) {
    const getResponse = await fetch(
      `https://api.onkernel.com/profiles/${encodeURIComponent(profileName)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      }
    );
    if (getResponse.ok) {
      return { name: profileName };
    }
    if (getResponse.status !== 404) {
      throw new Error(`Failed to check Kernel profile: ${getResponse.statusText}`);
    }
    const createResponse = await fetch("https://api.onkernel.com/profiles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ name: profileName })
    });
    if (!createResponse.ok) {
      throw new Error(`Failed to create Kernel profile: ${createResponse.statusText}`);
    }
    return { name: profileName };
  }
  /**
   * Connect to Kernel remote browser via CDP.
   * Requires KERNEL_API_KEY environment variable.
   */
  async connectToKernel() {
    const kernelApiKey = process.env.KERNEL_API_KEY;
    if (!kernelApiKey) {
      throw new Error("KERNEL_API_KEY is required when using kernel as a provider");
    }
    const profileName = process.env.KERNEL_PROFILE_NAME;
    let profileConfig;
    if (profileName) {
      await this.findOrCreateKernelProfile(profileName, kernelApiKey);
      profileConfig = {
        profile: {
          name: profileName,
          save_changes: true
          // Save cookies/state back to the profile when session ends
        }
      };
    }
    const response = await fetch("https://api.onkernel.com/browsers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${kernelApiKey}`
      },
      body: JSON.stringify({
        // Kernel browsers are headful by default with stealth mode available
        // The user can configure these via environment variables if needed
        headless: process.env.KERNEL_HEADLESS?.toLowerCase() === "true",
        stealth: process.env.KERNEL_STEALTH?.toLowerCase() !== "false",
        // Default to stealth mode
        timeout_seconds: parseInt(process.env.KERNEL_TIMEOUT_SECONDS || "300", 10),
        // Load and save to a profile if specified
        ...profileConfig
      })
    });
    if (!response.ok) {
      throw new Error(`Failed to create Kernel session: ${response.statusText}`);
    }
    let session;
    try {
      session = await response.json();
    } catch (error) {
      throw new Error(
        `Failed to parse Kernel session response: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    if (!session.session_id || !session.cdp_ws_url) {
      throw new Error(
        `Invalid Kernel session response: missing ${!session.session_id ? "session_id" : "cdp_ws_url"}`
      );
    }
    const browser2 = await import_playwright_core.chromium.connectOverCDP(session.cdp_ws_url).catch(() => {
      throw new Error("Failed to connect to Kernel session via CDP");
    });
    try {
      const contexts = browser2.contexts();
      let context;
      let page2;
      if (contexts.length === 0) {
        context = await browser2.newContext();
        page2 = await context.newPage();
      } else {
        context = contexts[0];
        const pages = context.pages();
        page2 = pages[0] ?? await context.newPage();
      }
      this.kernelSessionId = session.session_id;
      this.kernelApiKey = kernelApiKey;
      this.browser = browser2;
      context.setDefaultTimeout(getDefaultTimeout());
      this.contexts.push(context);
      this.setupContextTracking(context);
      await this.ensureDomainFilter(context);
      await this.sanitizeExistingPages([page2]);
      this.pages.push(page2);
      this.activePageIndex = 0;
      this.setupPageTracking(page2);
    } catch (error) {
      await this.closeKernelSession(session.session_id, kernelApiKey).catch((sessionError) => {
        console.error("Failed to close Kernel session during cleanup:", sessionError);
      });
      throw error;
    }
  }
  /**
   * Connect to Browser Use remote browser via CDP.
   * Requires BROWSER_USE_API_KEY environment variable.
   */
  async connectToBrowserUse() {
    const browserUseApiKey = process.env.BROWSER_USE_API_KEY;
    if (!browserUseApiKey) {
      throw new Error("BROWSER_USE_API_KEY is required when using browseruse as a provider");
    }
    const response = await fetch("https://api.browser-use.com/api/v2/browsers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Browser-Use-API-Key": browserUseApiKey
      },
      body: JSON.stringify({})
    });
    if (!response.ok) {
      throw new Error(`Failed to create Browser Use session: ${response.statusText}`);
    }
    let session;
    try {
      session = await response.json();
    } catch (error) {
      throw new Error(
        `Failed to parse Browser Use session response: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    if (!session.id || !session.cdpUrl) {
      throw new Error(
        `Invalid Browser Use session response: missing ${!session.id ? "id" : "cdpUrl"}`
      );
    }
    const browser2 = await import_playwright_core.chromium.connectOverCDP(session.cdpUrl).catch(() => {
      throw new Error("Failed to connect to Browser Use session via CDP");
    });
    try {
      const contexts = browser2.contexts();
      let context;
      let page2;
      if (contexts.length === 0) {
        context = await browser2.newContext();
        page2 = await context.newPage();
      } else {
        context = contexts[0];
        const pages = context.pages();
        page2 = pages[0] ?? await context.newPage();
      }
      this.browserUseSessionId = session.id;
      this.browserUseApiKey = browserUseApiKey;
      this.browser = browser2;
      context.setDefaultTimeout(getDefaultTimeout());
      this.contexts.push(context);
      this.setupContextTracking(context);
      await this.ensureDomainFilter(context);
      await this.sanitizeExistingPages([page2]);
      this.pages.push(page2);
      this.activePageIndex = 0;
      this.setupPageTracking(page2);
    } catch (error) {
      await this.closeBrowserUseSession(session.id, browserUseApiKey).catch((sessionError) => {
        console.error("Failed to close Browser Use session during cleanup:", sessionError);
      });
      throw error;
    }
  }
  /**
   * Launch the browser with the specified options
   * If already launched, this is a no-op (browser stays open)
   */
  async launch(options) {
    const _debugLogPath = import_node_path2.default.join(import_node_os2.default.homedir(), ".agent-browser", "debug.log");
    try {
      const { mkdirSync: mkdirSync7, appendFileSync: appendFileSync2 } = await import("fs");
      const cdpEp = options.cdpUrl ?? (options.cdpPort ? String(options.cdpPort) : void 0);
      const _lines = [
        `[${(/* @__PURE__ */ new Date()).toISOString()}] === BROWSER LAUNCH DEBUG ===`,
        `  options.profile: ${JSON.stringify(options.profile)}`,
        `  options.storageState: ${JSON.stringify(!!options.storageState)}`,
        `  options.extensions: ${JSON.stringify(options.extensions)}`,
        `  options.autoConnect: ${JSON.stringify(options.autoConnect)}`,
        `  options.cdpUrl: ${JSON.stringify(options.cdpUrl)}`,
        `  options.cdpPort: ${JSON.stringify(options.cdpPort)}`,
        `  options.headless: ${JSON.stringify(options.headless)}`,
        `  cdpEndpoint: ${JSON.stringify(cdpEp)}`,
        `  hasExtensions: ${!!options.extensions?.length}`,
        `  hasProfile: ${!!options.profile}`,
        `  hasStorageState: ${!!options.storageState}`,
        `  isLaunched: ${this.isLaunched()}`
      ];
      mkdirSync7(import_node_path2.default.dirname(_debugLogPath), { recursive: true });
      appendFileSync2(_debugLogPath, _lines.join("\n") + "\n\n");
    } catch (_e) {
    }
    const cdpEndpoint = options.cdpUrl ?? (options.cdpPort ? String(options.cdpPort) : void 0);
    const hasExtensions = !!options.extensions?.length;
    const hasProfile = !!options.profile;
    const hasStorageState = !!options.storageState;
    if (hasExtensions && cdpEndpoint) {
      throw new Error("Extensions cannot be used with CDP connection");
    }
    if (hasProfile && cdpEndpoint) {
      throw new Error("Profile cannot be used with CDP connection");
    }
    if (hasStorageState && hasProfile) {
      throw new Error(
        "Storage state cannot be used with profile (profile is already persistent storage)"
      );
    }
    if (hasStorageState && hasExtensions) {
      throw new Error(
        "Storage state cannot be used with extensions (extensions require persistent context)"
      );
    }
    if (this.isLaunched()) {
      const needsRelaunch = !cdpEndpoint && !options.autoConnect && this.cdpEndpoint !== null || !!cdpEndpoint && this.needsCdpReconnect(cdpEndpoint) || !!options.autoConnect && !this.isCdpConnectionAlive();
      if (needsRelaunch) {
        await this.close();
      } else if (options.autoConnect && this.isCdpConnectionAlive()) {
        if (options.downloadPath) {
          this.downloadPath = options.downloadPath;
        }
        return;
      } else {
        if (options.downloadPath) {
          this.downloadPath = options.downloadPath;
        }
        return;
      }
    }
    if (options.colorScheme) {
      this.colorScheme = options.colorScheme;
    }
    if (options.downloadPath) {
      this.downloadPath = options.downloadPath;
    }
    if (!this.downloadPath) {
      this.downloadPath = import_node_path2.default.join(import_node_os2.default.homedir(), "Downloads");
    }
    if (options.allowedDomains && options.allowedDomains.length > 0) {
      this.allowedDomains = options.allowedDomains.map((d) => d.toLowerCase());
    } else {
      const envDomains = process.env.AGENT_BROWSER_ALLOWED_DOMAINS;
      if (envDomains) {
        this.allowedDomains = parseDomainList(envDomains);
      }
    }
    if (this.downloadPath && (cdpEndpoint || options.autoConnect)) {
      const warning = "--download-path is ignored when connecting via CDP or auto-connect (downloads use the remote browser's configuration)";
      this.launchWarnings.push(warning);
      console.error(`[WARN] ${warning}`);
    }
    if (cdpEndpoint) {
      await this.connectViaCDP(cdpEndpoint);
      return;
    }
    if (options.autoConnect) {
      await this.autoConnectViaCDP();
      return;
    }
    const provider = options.provider ?? process.env.AGENT_BROWSER_PROVIDER;
    if (this.downloadPath && provider) {
      const warning = "--download-path is ignored when using a cloud provider (downloads use the remote browser's configuration)";
      this.launchWarnings.push(warning);
      console.error(`[WARN] ${warning}`);
    }
    if (provider === "browserbase") {
      await this.connectToBrowserbase();
      return;
    }
    if (provider === "browseruse") {
      await this.connectToBrowserUse();
      return;
    }
    if (provider === "kernel") {
      await this.connectToKernel();
      return;
    }
    if (this.downloadPath) {
      const resolved = import_node_path2.default.resolve(this.downloadPath);
      const stat = (0, import_node_fs2.statSync)(resolved, { throwIfNoEntry: false });
      if (stat && !stat.isDirectory()) {
        throw new Error(`Download path is not a directory: ${resolved}`);
      }
      if (!stat) {
        try {
          (0, import_node_fs2.mkdirSync)(resolved, { recursive: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new Error(`Cannot create download directory '${resolved}': ${msg}`);
        }
      }
      this.downloadPath = resolved;
    }
    const browserType = options.browser ?? "chromium";
    if (hasExtensions && browserType !== "chromium") {
      throw new Error("Extensions are only supported in Chromium");
    }
    if (options.allowFileAccess && browserType !== "chromium") {
      throw new Error("allowFileAccess is only supported in Chromium");
    }
    const launcher = browserType === "firefox" ? import_playwright_core.firefox : browserType === "webkit" ? import_playwright_core.webkit : import_playwright_core.chromium;
    const fileAccessArgs = options.allowFileAccess ? ["--allow-file-access-from-files", "--allow-file-access"] : [];
    const baseArgs = options.args ? [...fileAccessArgs, ...options.args] : fileAccessArgs.length > 0 ? fileAccessArgs : void 0;
    const hasWindowSizeArgs = baseArgs?.some(
      (arg) => arg === "--start-maximized" || arg.startsWith("--window-size=")
    );
    const viewport = options.viewport !== void 0 ? options.viewport : hasWindowSizeArgs ? null : { width: 1280, height: 720 };
    let autoChannel;
    if (!options.executablePath && browserType === "chromium") {
      const chromePaths = process.platform === "win32" ? [
        process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
      ] : process.platform === "darwin" ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"] : [
        "/opt/google/chrome/chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable"
      ];
      const edgePaths = process.platform === "win32" ? [
        process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe`,
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
      ] : process.platform === "darwin" ? ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"] : [
        "/opt/microsoft/msedge/msedge",
        "/usr/bin/microsoft-edge",
        "/usr/bin/microsoft-edge-stable"
      ];
      if (chromePaths.some((p) => p && (0, import_node_fs2.existsSync)(p))) {
        autoChannel = "chrome";
      } else if (edgePaths.some((p) => p && (0, import_node_fs2.existsSync)(p))) {
        autoChannel = "msedge";
      }
    }
    let context;
    if (hasExtensions) {
      const extPaths = options.extensions.join(",");
      const session = process.env.AGENT_BROWSER_SESSION || "default";
      const extArgs = [`--disable-extensions-except=${extPaths}`, `--load-extension=${extPaths}`];
      const allArgs = baseArgs ? [...extArgs, ...baseArgs] : extArgs;
      context = await launcher.launchPersistentContext(
        import_node_path2.default.join(import_node_os2.default.tmpdir(), `agent-browser-ext-${session}`),
        {
          headless: options.headless ?? true,
          executablePath: options.executablePath,
          ...autoChannel && { channel: autoChannel },
          args: allArgs,
          viewport,
          extraHTTPHeaders: options.headers,
          userAgent: options.userAgent,
          ...options.proxy && { proxy: options.proxy },
          ignoreHTTPSErrors: options.ignoreHTTPSErrors ?? false,
          ...this.colorScheme && { colorScheme: this.colorScheme },
          ...this.downloadPath && { downloadsPath: this.downloadPath }
        }
      );
      this.isPersistentContext = true;
    } else if (hasProfile) {
      const profilePath2 = options.profile.replace(/^~\//, import_node_os2.default.homedir() + "/");
      context = await launcher.launchPersistentContext(profilePath2, {
        headless: options.headless ?? true,
        executablePath: options.executablePath,
        ...autoChannel && { channel: autoChannel },
        args: baseArgs,
        viewport,
        extraHTTPHeaders: options.headers,
        userAgent: options.userAgent,
        ...options.proxy && { proxy: options.proxy },
        ignoreHTTPSErrors: options.ignoreHTTPSErrors ?? false,
        ...this.colorScheme && { colorScheme: this.colorScheme },
        ...this.downloadPath && { downloadsPath: this.downloadPath }
      });
      this.isPersistentContext = true;
    } else {
      this.browser = await launcher.launch({
        headless: options.headless ?? true,
        executablePath: options.executablePath,
        ...autoChannel && { channel: autoChannel },
        args: baseArgs,
        ...this.downloadPath && { downloadsPath: this.downloadPath }
      });
      this.cdpEndpoint = null;
      let storageState = options.storageState ? options.storageState : void 0;
      if (!storageState && options.autoStateFilePath) {
        try {
          const fs4 = await import("fs");
          if (fs4.existsSync(options.autoStateFilePath)) {
            const content = fs4.readFileSync(options.autoStateFilePath, "utf8");
            const parsed = JSON.parse(content);
            if (isEncryptedPayload(parsed)) {
              const key = getEncryptionKey();
              if (key) {
                try {
                  const decrypted = decryptData(parsed, key);
                  storageState = JSON.parse(decrypted);
                  if (process.env.AGENT_BROWSER_DEBUG === "1") {
                    console.error(
                      `[DEBUG] Auto-loading session state (decrypted): ${options.autoStateFilePath}`
                    );
                  }
                } catch (decryptErr) {
                  const warning = "Failed to decrypt state file - wrong encryption key? Starting fresh.";
                  this.launchWarnings.push(warning);
                  console.error(`[WARN] ${warning}`);
                  if (process.env.AGENT_BROWSER_DEBUG === "1") {
                    console.error(`[DEBUG] Decryption error:`, decryptErr);
                  }
                }
              } else {
                const warning = `State file is encrypted but ${ENCRYPTION_KEY_ENV} not set - starting fresh`;
                this.launchWarnings.push(warning);
                console.error(`[WARN] ${warning}`);
              }
            } else {
              storageState = options.autoStateFilePath;
              if (process.env.AGENT_BROWSER_DEBUG === "1") {
                console.error(`[DEBUG] Auto-loading session state: ${options.autoStateFilePath}`);
              }
            }
          }
        } catch (err) {
          if (process.env.AGENT_BROWSER_DEBUG === "1") {
            console.error(`[DEBUG] Failed to load state file, starting fresh:`, err);
          }
        }
      }
      context = await this.browser.newContext({
        viewport,
        extraHTTPHeaders: options.headers,
        userAgent: options.userAgent,
        storageState,
        ...options.proxy && { proxy: options.proxy },
        ignoreHTTPSErrors: options.ignoreHTTPSErrors ?? false,
        ...this.colorScheme && { colorScheme: this.colorScheme }
      });
    }
    context.setDefaultTimeout(getDefaultTimeout());
    this.contexts.push(context);
    this.setupContextTracking(context);
    await this.ensureDomainFilter(context);
    const page2 = context.pages()[0] ?? await context.newPage();
    await this.sanitizeExistingPages([page2]);
    if (!this.pages.includes(page2)) {
      this.pages.push(page2);
      this.setupPageTracking(page2);
    }
    this.activePageIndex = this.pages.length > 0 ? this.pages.length - 1 : 0;
  }
  /**
   * Connect to a running browser via CDP (Chrome DevTools Protocol)
   * @param cdpEndpoint Either a port number (as string) or a full WebSocket URL (ws:// or wss://)
   */
  async connectViaCDP(cdpEndpoint, options) {
    if (!cdpEndpoint) {
      throw new Error("CDP endpoint is required for CDP connection");
    }
    let cdpUrl;
    if (cdpEndpoint.startsWith("ws://") || cdpEndpoint.startsWith("wss://") || cdpEndpoint.startsWith("http://") || cdpEndpoint.startsWith("https://")) {
      cdpUrl = cdpEndpoint;
    } else if (/^\d+$/.test(cdpEndpoint)) {
      cdpUrl = `http://localhost:${cdpEndpoint}`;
    } else {
      cdpUrl = `http://localhost:${cdpEndpoint}`;
    }
    const browser2 = await import_playwright_core.chromium.connectOverCDP(cdpUrl, { timeout: options?.timeout }).catch(() => {
      throw new Error(
        `Failed to connect via CDP to ${cdpUrl}. ` + (cdpUrl.includes("localhost") ? `Make sure the app is running with --remote-debugging-port=${cdpEndpoint}` : "Make sure the remote browser is accessible and the URL is correct.")
      );
    });
    try {
      const contexts = browser2.contexts();
      if (contexts.length === 0) {
        throw new Error("No browser context found. Make sure the app has an open window.");
      }
      const allPages = contexts.flatMap((context) => context.pages()).filter((page2) => page2.url());
      if (allPages.length === 0) {
        throw new Error("No page found. Make sure the app has loaded content.");
      }
      this.browser = browser2;
      this.cdpEndpoint = cdpEndpoint;
      for (const context of contexts) {
        context.setDefaultTimeout(1e4);
        this.contexts.push(context);
        this.setupContextTracking(context);
        await this.ensureDomainFilter(context);
      }
      await this.sanitizeExistingPages(allPages);
      for (const page2 of allPages) {
        this.pages.push(page2);
        this.setupPageTracking(page2);
      }
      this.activePageIndex = 0;
    } catch (error) {
      await browser2.close().catch(() => {
      });
      throw error;
    }
  }
  /**
   * Get Chrome's default user data directory paths for the current platform.
   * Returns an array of candidate paths to check (stable, then beta/canary).
   */
  getChromeUserDataDirs() {
    const home = import_node_os2.default.homedir();
    const platform = import_node_os2.default.platform();
    if (platform === "darwin") {
      return [
        import_node_path2.default.join(home, "Library", "Application Support", "Google", "Chrome"),
        import_node_path2.default.join(home, "Library", "Application Support", "Google", "Chrome Canary"),
        import_node_path2.default.join(home, "Library", "Application Support", "Chromium")
      ];
    } else if (platform === "win32") {
      const localAppData = process.env.LOCALAPPDATA ?? import_node_path2.default.join(home, "AppData", "Local");
      return [
        import_node_path2.default.join(localAppData, "Google", "Chrome", "User Data"),
        import_node_path2.default.join(localAppData, "Google", "Chrome SxS", "User Data"),
        import_node_path2.default.join(localAppData, "Chromium", "User Data")
      ];
    } else {
      return [
        import_node_path2.default.join(home, ".config", "google-chrome"),
        import_node_path2.default.join(home, ".config", "google-chrome-unstable"),
        import_node_path2.default.join(home, ".config", "chromium")
      ];
    }
  }
  /**
   * Try to read the DevToolsActivePort file from a Chrome user data directory.
   * Returns { port, wsPath } if found, or null if not available.
   */
  readDevToolsActivePort(userDataDir) {
    const filePath = import_node_path2.default.join(userDataDir, "DevToolsActivePort");
    try {
      if (!(0, import_node_fs2.existsSync)(filePath)) return null;
      const content = (0, import_node_fs2.readFileSync)(filePath, "utf-8").trim();
      const lines = content.split("\n");
      if (lines.length < 2) return null;
      const port = parseInt(lines[0].trim(), 10);
      const wsPath = lines[1].trim();
      if (isNaN(port) || port <= 0 || port > 65535) return null;
      if (!wsPath) return null;
      return { port, wsPath };
    } catch {
      return null;
    }
  }
  /**
   * Try to discover a Chrome CDP endpoint by querying an HTTP debug port.
   * Returns the WebSocket debugger URL if available.
   */
  async probeDebugPort(port) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(2e3)
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data.webSocketDebuggerUrl ?? null;
    } catch {
      return null;
    }
  }
  /**
   * Auto-discover and connect to a running Chrome/Chromium instance.
   *
   * Discovery strategy:
   * 1. Read DevToolsActivePort from Chrome's default user data directories
   * 2. If found, connect using the port and WebSocket path from that file
   * 3. If not found, probe common debugging ports (9222, 9229)
   * 4. If a port responds, connect via CDP
   */
  async autoConnectViaCDP() {
    const userDataDirs = this.getChromeUserDataDirs();
    for (const dir of userDataDirs) {
      const activePort = this.readDevToolsActivePort(dir);
      if (activePort) {
        const wsUrl = await this.probeDebugPort(activePort.port);
        if (wsUrl) {
          await this.connectViaCDP(wsUrl);
          return;
        }
        const directWsUrl = `ws://127.0.0.1:${activePort.port}${activePort.wsPath}`;
        try {
          if (process.env.AGENT_BROWSER_DEBUG === "1") {
            console.error(
              `[DEBUG] HTTP probe failed on port ${activePort.port}, attempting direct WebSocket connection to ${directWsUrl}`
            );
          }
          await this.connectViaCDP(directWsUrl, { timeout: 6e4 });
          return;
        } catch {
        }
      }
    }
    const commonPorts = [9222, 9229];
    for (const port of commonPorts) {
      const wsUrl = await this.probeDebugPort(port);
      if (wsUrl) {
        await this.connectViaCDP(wsUrl);
        return;
      }
    }
    const platform = import_node_os2.default.platform();
    let hint;
    if (platform === "darwin") {
      hint = "Start Chrome with: /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222\nOr enable remote debugging in Chrome 144+ at chrome://inspect/#remote-debugging";
    } else if (platform === "win32") {
      hint = "Start Chrome with: chrome.exe --remote-debugging-port=9222\nOr enable remote debugging in Chrome 144+ at chrome://inspect/#remote-debugging";
    } else {
      hint = "Start Chrome with: google-chrome --remote-debugging-port=9222\nOr enable remote debugging in Chrome 144+ at chrome://inspect/#remote-debugging";
    }
    throw new Error(`No running Chrome instance with remote debugging found.
${hint}`);
  }
  /**
   * Set up console, error, and close tracking for a page
   */
  setupPageTracking(page2) {
    if (this.colorScheme) {
      page2.emulateMedia({ colorScheme: this.colorScheme }).catch(() => {
      });
    }
    page2.on("console", (msg) => {
      this.consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: Date.now()
      });
    });
    page2.on("pageerror", (error) => {
      this.pageErrors.push({
        message: error.message,
        timestamp: Date.now()
      });
    });
    page2.on("close", () => {
      const index = this.pages.indexOf(page2);
      if (index !== -1) {
        this.pages.splice(index, 1);
        if (this.activePageIndex >= this.pages.length) {
          this.activePageIndex = Math.max(0, this.pages.length - 1);
        }
      }
    });
    if (this.downloadPath) {
      const downloadDir = this.downloadPath;
      page2.on("download", (download) => {
        const filename = download.suggestedFilename();
        const savePath = import_node_path2.default.join(downloadDir, filename);
        download.saveAs(savePath).catch((err) => {
          console.error(`[WARN] Failed to save download '${filename}': ${err}`);
        });
      });
    }
  }
  /**
   * Set up tracking for new pages in a context (for CDP connections and popups/new tabs)
   * This handles pages created externally (e.g., via target="_blank" links, window.open)
   */
  setupContextTracking(context) {
    context.on("page", (page2) => {
      if (!this.pages.includes(page2)) {
        this.pages.push(page2);
        this.setupPageTracking(page2);
      }
      const newIndex = this.pages.indexOf(page2);
      if (newIndex !== -1 && newIndex !== this.activePageIndex) {
        this.activePageIndex = newIndex;
        this.invalidateCDPSession().catch(() => {
        });
      }
    });
  }
  /**
   * Create a new tab in the current context
   */
  async newTab() {
    if (!this.browser || this.contexts.length === 0) {
      throw new Error("Browser not launched");
    }
    await this.invalidateCDPSession();
    const context = this.contexts[0];
    const page2 = await context.newPage();
    if (!this.pages.includes(page2)) {
      this.pages.push(page2);
      this.setupPageTracking(page2);
    }
    this.activePageIndex = this.pages.length - 1;
    return { index: this.activePageIndex, total: this.pages.length };
  }
  /**
   * Create a new window (new context)
   */
  async newWindow(viewport) {
    if (!this.browser) {
      throw new Error("Browser not launched");
    }
    const context = await this.browser.newContext({
      viewport: viewport === void 0 ? { width: 1280, height: 720 } : viewport,
      ...this.colorScheme && { colorScheme: this.colorScheme }
    });
    context.setDefaultTimeout(getDefaultTimeout());
    this.contexts.push(context);
    this.setupContextTracking(context);
    await this.ensureDomainFilter(context);
    const page2 = await context.newPage();
    if (!this.pages.includes(page2)) {
      this.pages.push(page2);
      this.setupPageTracking(page2);
    }
    this.activePageIndex = this.pages.length - 1;
    return { index: this.activePageIndex, total: this.pages.length };
  }
  /**
   * Invalidate the current CDP session (must be called before switching pages)
   * This ensures screencast and input injection work correctly after tab switch
   */
  async invalidateCDPSession() {
    if (this.screencastActive) {
      await this.stopScreencast();
    }
    if (this.cdpSession) {
      await this.cdpSession.detach().catch(() => {
      });
      this.cdpSession = null;
    }
  }
  /**
   * Switch to a specific tab/page by index
   */
  async switchTo(index) {
    if (index < 0 || index >= this.pages.length) {
      throw new Error(`Invalid tab index: ${index}. Available: 0-${this.pages.length - 1}`);
    }
    if (index !== this.activePageIndex) {
      await this.invalidateCDPSession();
    }
    this.activePageIndex = index;
    const page2 = this.pages[index];
    return {
      index: this.activePageIndex,
      url: page2.url(),
      title: ""
      // Title requires async, will be fetched separately
    };
  }
  /**
   * Close a specific tab/page
   */
  async closeTab(index) {
    const targetIndex = index ?? this.activePageIndex;
    if (targetIndex < 0 || targetIndex >= this.pages.length) {
      throw new Error(`Invalid tab index: ${targetIndex}`);
    }
    if (this.pages.length === 1) {
      throw new Error('Cannot close the last tab. Use "close" to close the browser.');
    }
    if (targetIndex === this.activePageIndex) {
      await this.invalidateCDPSession();
    }
    const page2 = this.pages[targetIndex];
    await page2.close();
    this.pages.splice(targetIndex, 1);
    if (this.activePageIndex >= this.pages.length) {
      this.activePageIndex = this.pages.length - 1;
    } else if (this.activePageIndex > targetIndex) {
      this.activePageIndex--;
    }
    return { closed: targetIndex, remaining: this.pages.length };
  }
  /**
   * List all tabs with their info
   */
  async listTabs() {
    const tabs = await Promise.all(
      this.pages.map(async (page2, index) => ({
        index,
        url: page2.url(),
        title: await page2.title().catch(() => ""),
        active: index === this.activePageIndex
      }))
    );
    return tabs;
  }
  /**
   * Get or create a CDP session for the current page
   * Only works with Chromium-based browsers
   */
  async getCDPSession() {
    if (this.cdpSession) {
      return this.cdpSession;
    }
    const page2 = this.getPage();
    const context = page2.context();
    this.cdpSession = await context.newCDPSession(page2);
    return this.cdpSession;
  }
  /**
   * Check if screencast is currently active
   */
  isScreencasting() {
    return this.screencastActive;
  }
  /**
   * Start screencast - streams viewport frames via CDP
   * @param callback Function called for each frame
   * @param options Screencast options
   */
  async startScreencast(callback, options) {
    if (this.screencastActive) {
      throw new Error("Screencast already active");
    }
    const cdp = await this.getCDPSession();
    this.frameCallback = callback;
    this.screencastActive = true;
    this.screencastFrameHandler = async (params) => {
      const frame = {
        data: params.data,
        metadata: params.metadata,
        sessionId: params.sessionId
      };
      await cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId });
      if (this.frameCallback) {
        this.frameCallback(frame);
      }
    };
    cdp.on("Page.screencastFrame", this.screencastFrameHandler);
    await cdp.send("Page.startScreencast", {
      format: options?.format ?? "jpeg",
      quality: options?.quality ?? 80,
      maxWidth: options?.maxWidth ?? 1280,
      maxHeight: options?.maxHeight ?? 720,
      everyNthFrame: options?.everyNthFrame ?? 1
    });
  }
  /**
   * Stop screencast
   */
  async stopScreencast() {
    if (!this.screencastActive) {
      return;
    }
    try {
      const cdp = await this.getCDPSession();
      await cdp.send("Page.stopScreencast");
      if (this.screencastFrameHandler) {
        cdp.off("Page.screencastFrame", this.screencastFrameHandler);
      }
    } catch {
    }
    this.screencastActive = false;
    this.frameCallback = null;
    this.screencastFrameHandler = null;
  }
  /**
   * Check if profiling is currently active
   */
  isProfilingActive() {
    return this.profilingActive;
  }
  /**
   * Start CDP profiling (Tracing)
   */
  async startProfiling(options) {
    if (this.profilingActive) {
      throw new Error("Profiling already active");
    }
    const cdp = await this.getCDPSession();
    const dataHandler = (params) => {
      if (params.value) {
        for (const evt of params.value) {
          if (this.profileChunks.length >= _BrowserManager.MAX_PROFILE_EVENTS) {
            if (!this.profileEventsDropped) {
              this.profileEventsDropped = true;
              console.warn(
                `Profiling: exceeded ${_BrowserManager.MAX_PROFILE_EVENTS} events, dropping further data`
              );
            }
            return;
          }
          this.profileChunks.push(evt);
        }
      }
    };
    const completeHandler = () => {
      if (this.profileCompleteResolver) {
        this.profileCompleteResolver();
      }
    };
    cdp.on("Tracing.dataCollected", dataHandler);
    cdp.on("Tracing.tracingComplete", completeHandler);
    const categories = options?.categories ?? [
      "devtools.timeline",
      "disabled-by-default-devtools.timeline",
      "disabled-by-default-devtools.timeline.frame",
      "disabled-by-default-devtools.timeline.stack",
      "v8.execute",
      "disabled-by-default-v8.cpu_profiler",
      "disabled-by-default-v8.cpu_profiler.hires",
      "v8",
      "disabled-by-default-v8.runtime_stats",
      "blink",
      "blink.user_timing",
      "latencyInfo",
      "renderer.scheduler",
      "sequence_manager",
      "toplevel"
    ];
    try {
      await cdp.send("Tracing.start", {
        traceConfig: {
          includedCategories: categories,
          enableSampling: true
        },
        transferMode: "ReportEvents"
      });
    } catch (error) {
      cdp.off("Tracing.dataCollected", dataHandler);
      cdp.off("Tracing.tracingComplete", completeHandler);
      throw error;
    }
    this.profilingActive = true;
    this.profileChunks = [];
    this.profileEventsDropped = false;
    this.profileDataHandler = dataHandler;
    this.profileCompleteHandler = completeHandler;
  }
  /**
   * Stop CDP profiling and save to file
   */
  async stopProfiling(outputPath) {
    if (!this.profilingActive) {
      throw new Error("No profiling session active");
    }
    const cdp = await this.getCDPSession();
    const TRACE_TIMEOUT_MS = 3e4;
    const completePromise = new Promise((resolve2, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Profiling data collection timed out")),
        TRACE_TIMEOUT_MS
      );
      this.profileCompleteResolver = () => {
        clearTimeout(timer);
        resolve2();
      };
    });
    await cdp.send("Tracing.end");
    let chunks;
    try {
      await completePromise;
      chunks = this.profileChunks;
    } finally {
      if (this.profileDataHandler) {
        cdp.off("Tracing.dataCollected", this.profileDataHandler);
      }
      if (this.profileCompleteHandler) {
        cdp.off("Tracing.tracingComplete", this.profileCompleteHandler);
      }
      this.profilingActive = false;
      this.profileChunks = [];
      this.profileEventsDropped = false;
      this.profileCompleteResolver = null;
      this.profileDataHandler = null;
      this.profileCompleteHandler = null;
    }
    const clockDomain = process.platform === "linux" ? "LINUX_CLOCK_MONOTONIC" : process.platform === "darwin" ? "MAC_MACH_ABSOLUTE_TIME" : void 0;
    const traceData = {
      traceEvents: chunks
    };
    if (clockDomain) {
      traceData.metadata = { "clock-domain": clockDomain };
    }
    const dir = import_node_path2.default.dirname(outputPath);
    await (0, import_promises.mkdir)(dir, { recursive: true });
    await (0, import_promises.writeFile)(outputPath, JSON.stringify(traceData));
    const eventCount = chunks.length;
    return { path: outputPath, eventCount };
  }
  /**
   * Inject a mouse event via CDP
   */
  async injectMouseEvent(params) {
    const cdp = await this.getCDPSession();
    const cdpButton = params.button === "left" ? "left" : params.button === "right" ? "right" : params.button === "middle" ? "middle" : "none";
    await cdp.send("Input.dispatchMouseEvent", {
      type: params.type,
      x: params.x,
      y: params.y,
      button: cdpButton,
      clickCount: params.clickCount ?? 1,
      deltaX: params.deltaX ?? 0,
      deltaY: params.deltaY ?? 0,
      modifiers: params.modifiers ?? 0
    });
  }
  /**
   * Inject a keyboard event via CDP
   */
  async injectKeyboardEvent(params) {
    const cdp = await this.getCDPSession();
    await cdp.send("Input.dispatchKeyEvent", {
      type: params.type,
      key: params.key,
      code: params.code,
      text: params.text,
      modifiers: params.modifiers ?? 0
    });
  }
  /**
   * Inject touch event via CDP (for mobile emulation)
   */
  async injectTouchEvent(params) {
    const cdp = await this.getCDPSession();
    await cdp.send("Input.dispatchTouchEvent", {
      type: params.type,
      touchPoints: params.touchPoints.map((tp, i) => ({
        x: tp.x,
        y: tp.y,
        id: tp.id ?? i
      })),
      modifiers: params.modifiers ?? 0
    });
  }
  /**
   * Check if video recording is currently active
   */
  isRecording() {
    return this.recordingContext !== null;
  }
  /**
   * Start recording to a video file using Playwright's native video recording.
   * Creates a fresh browser context with video recording enabled.
   * Automatically captures current URL and transfers cookies/storage if no URL provided.
   *
   * @param outputPath - Path to the output video file (will be .webm)
   * @param url - Optional URL to navigate to (defaults to current page URL)
   */
  async startRecording(outputPath, url) {
    if (this.recordingContext) {
      throw new Error(
        "Recording already in progress. Run 'record stop' first, or use 'record restart' to stop and start a new recording."
      );
    }
    if (!this.browser) {
      throw new Error("Browser not launched. Call launch first.");
    }
    if ((0, import_node_fs2.existsSync)(outputPath)) {
      throw new Error(`Output file already exists: ${outputPath}`);
    }
    if (!outputPath.endsWith(".webm")) {
      throw new Error(
        "Playwright native recording only supports WebM format. Please use a .webm extension."
      );
    }
    const currentPage = this.pages.length > 0 ? this.pages[this.activePageIndex] : null;
    const currentContext = this.contexts.length > 0 ? this.contexts[0] : null;
    if (!url && currentPage) {
      const currentUrl = currentPage.url();
      if (currentUrl && currentUrl !== "about:blank") {
        url = currentUrl;
      }
    }
    let storageState;
    if (currentContext) {
      try {
        storageState = await currentContext.storageState();
      } catch {
      }
    }
    const session = process.env.AGENT_BROWSER_SESSION || "default";
    this.recordingTempDir = import_node_path2.default.join(
      import_node_os2.default.tmpdir(),
      `agent-browser-recording-${session}-${Date.now()}`
    );
    (0, import_node_fs2.mkdirSync)(this.recordingTempDir, { recursive: true });
    this.recordingOutputPath = outputPath;
    const viewport = { width: 1280, height: 720 };
    this.recordingContext = await this.browser.newContext({
      viewport,
      recordVideo: {
        dir: this.recordingTempDir,
        size: viewport
      },
      storageState
    });
    this.recordingContext.setDefaultTimeout(1e4);
    this.recordingPage = await this.recordingContext.newPage();
    this.contexts.push(this.recordingContext);
    this.pages.push(this.recordingPage);
    this.activePageIndex = this.pages.length - 1;
    this.setupPageTracking(this.recordingPage);
    await this.invalidateCDPSession();
    if (url) {
      await this.recordingPage.goto(url, { waitUntil: "load" });
    }
  }
  /**
   * Stop recording and save the video file
   * @returns Recording result with path
   */
  async stopRecording() {
    if (!this.recordingContext || !this.recordingPage) {
      return { path: "", frames: 0, error: "No recording in progress" };
    }
    const outputPath = this.recordingOutputPath;
    try {
      const video = this.recordingPage.video();
      const pageIndex = this.pages.indexOf(this.recordingPage);
      if (pageIndex !== -1) {
        this.pages.splice(pageIndex, 1);
      }
      const contextIndex = this.contexts.indexOf(this.recordingContext);
      if (contextIndex !== -1) {
        this.contexts.splice(contextIndex, 1);
      }
      await this.recordingPage.close();
      if (video) {
        await video.saveAs(outputPath);
      }
      if (this.recordingTempDir) {
        (0, import_node_fs2.rmSync)(this.recordingTempDir, { recursive: true, force: true });
      }
      await this.recordingContext.close();
      this.recordingContext = null;
      this.recordingPage = null;
      this.recordingOutputPath = "";
      this.recordingTempDir = "";
      if (this.pages.length > 0) {
        this.activePageIndex = Math.min(this.activePageIndex, this.pages.length - 1);
      } else {
        this.activePageIndex = 0;
      }
      await this.invalidateCDPSession();
      return { path: outputPath, frames: 0 };
    } catch (error) {
      if (this.recordingTempDir) {
        (0, import_node_fs2.rmSync)(this.recordingTempDir, { recursive: true, force: true });
      }
      this.recordingContext = null;
      this.recordingPage = null;
      this.recordingOutputPath = "";
      this.recordingTempDir = "";
      const message = error instanceof Error ? error.message : String(error);
      return { path: outputPath, frames: 0, error: message };
    }
  }
  /**
   * Restart recording - stops current recording (if any) and starts a new one.
   * Convenience method that combines stopRecording and startRecording.
   *
   * @param outputPath - Path to the output video file (must be .webm)
   * @param url - Optional URL to navigate to (defaults to current page URL)
   * @returns Result from stopping the previous recording (if any)
   */
  async restartRecording(outputPath, url) {
    let previousPath;
    let stopped = false;
    if (this.recordingContext) {
      const result = await this.stopRecording();
      previousPath = result.path;
      stopped = true;
    }
    await this.startRecording(outputPath, url);
    return { previousPath, stopped };
  }
  /**
   * Close the browser and clean up
   */
  async close() {
    if (this.recordingContext) {
      await this.stopRecording();
    }
    if (this.screencastActive) {
      await this.stopScreencast();
    }
    if (this.profilingActive) {
      const cdp = this.cdpSession;
      if (cdp) {
        if (this.profileDataHandler) {
          cdp.off("Tracing.dataCollected", this.profileDataHandler);
        }
        if (this.profileCompleteHandler) {
          cdp.off("Tracing.tracingComplete", this.profileCompleteHandler);
        }
        await cdp.send("Tracing.end").catch(() => {
        });
      }
      this.profilingActive = false;
      this.profileChunks = [];
      this.profileEventsDropped = false;
      this.profileCompleteResolver = null;
      this.profileDataHandler = null;
      this.profileCompleteHandler = null;
    }
    if (this.cdpSession) {
      await this.cdpSession.detach().catch(() => {
      });
      this.cdpSession = null;
    }
    if (this.browserbaseSessionId && this.browserbaseApiKey) {
      await this.closeBrowserbaseSession(this.browserbaseSessionId, this.browserbaseApiKey).catch(
        (error) => {
          console.error("Failed to close Browserbase session:", error);
        }
      );
      this.browser = null;
    } else if (this.browserUseSessionId && this.browserUseApiKey) {
      await this.closeBrowserUseSession(this.browserUseSessionId, this.browserUseApiKey).catch(
        (error) => {
          console.error("Failed to close Browser Use session:", error);
        }
      );
      this.browser = null;
    } else if (this.kernelSessionId && this.kernelApiKey) {
      await this.closeKernelSession(this.kernelSessionId, this.kernelApiKey).catch((error) => {
        console.error("Failed to close Kernel session:", error);
      });
      this.browser = null;
    } else if (this.cdpEndpoint !== null) {
      if (this.browser) {
        await this.browser.close().catch(() => {
        });
        this.browser = null;
      }
    } else {
      for (const page2 of this.pages) {
        await page2.close().catch(() => {
        });
      }
      for (const context of this.contexts) {
        await context.close().catch(() => {
        });
      }
      if (this.browser) {
        await this.browser.close().catch(() => {
        });
        this.browser = null;
      }
    }
    this.pages = [];
    this.contexts = [];
    this.cdpEndpoint = null;
    this.browserbaseSessionId = null;
    this.browserbaseApiKey = null;
    this.browserUseSessionId = null;
    this.browserUseApiKey = null;
    this.kernelSessionId = null;
    this.kernelApiKey = null;
    this.isPersistentContext = false;
    this.activePageIndex = 0;
    this.colorScheme = null;
    this.refMap = {};
    this.lastSnapshot = "";
    this.frameCallback = null;
  }
};

// node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});

// node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};

// node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el2 = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el2] = curr[el2] || { _errors: [] };
            } else {
              curr[el2] = curr[el2] || { _errors: [] };
              curr[el2]._errors.push(mapper(issue));
            }
            curr = curr[el2];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var en_default = errorMap;

// node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}

// node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = (params) => {
  const { data, path: path7, errorMaps, issueData } = params;
  const fullPath = [...path7, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;

// node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
  constructor(parent, value, path7, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path7;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements3) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element2 of elements3) {
        if (element2.status === "aborted")
          return INVALID;
        if (element2.status === "dirty")
          status.dirty();
        parsedSet.add(element2.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements2 = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements2).then((elements3) => finalizeSet(elements3));
    } else {
      return finalizeSet(elements2);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn2 = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn2, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn2, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: (arg) => ZodString.create({ ...arg, coerce: true }),
  number: (arg) => ZodNumber.create({ ...arg, coerce: true }),
  boolean: (arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  }),
  bigint: (arg) => ZodBigInt.create({ ...arg, coerce: true }),
  date: (arg) => ZodDate.create({ ...arg, coerce: true })
};
var NEVER = INVALID;

// src/protocol.ts
var baseCommandSchema = external_exports.object({
  id: external_exports.string(),
  action: external_exports.string()
});
var launchSchema = baseCommandSchema.extend({
  action: external_exports.literal("launch"),
  headless: external_exports.boolean().optional(),
  viewport: external_exports.object({
    width: external_exports.number().positive(),
    height: external_exports.number().positive()
  }).nullable().optional(),
  browser: external_exports.enum(["chromium", "firefox", "webkit"]).optional(),
  cdpPort: external_exports.number().positive().optional(),
  cdpUrl: external_exports.string().url().refine(
    (url) => url.startsWith("ws://") || url.startsWith("wss://") || url.startsWith("http://") || url.startsWith("https://"),
    { message: "CDP URL must start with ws://, wss://, http://, or https://" }
  ).optional(),
  autoConnect: external_exports.boolean().optional(),
  executablePath: external_exports.string().optional(),
  extensions: external_exports.array(external_exports.string()).optional(),
  headers: external_exports.record(external_exports.string()).optional(),
  proxy: external_exports.object({
    server: external_exports.string().min(1),
    bypass: external_exports.string().optional(),
    username: external_exports.string().optional(),
    password: external_exports.string().optional()
  }).optional(),
  args: external_exports.array(external_exports.string()).optional(),
  userAgent: external_exports.string().optional(),
  provider: external_exports.string().optional(),
  ignoreHTTPSErrors: external_exports.boolean().optional(),
  allowFileAccess: external_exports.boolean().optional(),
  colorScheme: external_exports.enum(["light", "dark", "no-preference"]).optional(),
  downloadPath: external_exports.string().optional(),
  profile: external_exports.string().optional(),
  storageState: external_exports.string().optional(),
  allowedDomains: external_exports.array(external_exports.string()).optional(),
  actionPolicy: external_exports.string().optional(),
  confirmActions: external_exports.array(external_exports.string()).optional(),
  engine: external_exports.enum(["chrome", "lightpanda"]).optional()
});
var navigateSchema = baseCommandSchema.extend({
  action: external_exports.literal("navigate"),
  url: external_exports.string().min(1),
  waitUntil: external_exports.enum(["load", "domcontentloaded", "networkidle"]).optional(),
  headers: external_exports.record(external_exports.string()).optional()
});
var clickSchema = baseCommandSchema.extend({
  action: external_exports.literal("click"),
  selector: external_exports.string().min(1),
  button: external_exports.enum(["left", "right", "middle"]).optional(),
  clickCount: external_exports.number().positive().optional(),
  delay: external_exports.number().nonnegative().optional(),
  newTab: external_exports.boolean().optional()
});
var typeSchema = baseCommandSchema.extend({
  action: external_exports.literal("type"),
  selector: external_exports.string().min(1),
  text: external_exports.string(),
  delay: external_exports.number().nonnegative().optional(),
  clear: external_exports.boolean().optional()
});
var fillSchema = baseCommandSchema.extend({
  action: external_exports.literal("fill"),
  selector: external_exports.string().min(1),
  value: external_exports.string()
});
var checkSchema = baseCommandSchema.extend({
  action: external_exports.literal("check"),
  selector: external_exports.string().min(1)
});
var uncheckSchema = baseCommandSchema.extend({
  action: external_exports.literal("uncheck"),
  selector: external_exports.string().min(1)
});
var uploadSchema = baseCommandSchema.extend({
  action: external_exports.literal("upload"),
  selector: external_exports.string().min(1),
  files: external_exports.union([external_exports.string(), external_exports.array(external_exports.string())])
});
var dblclickSchema = baseCommandSchema.extend({
  action: external_exports.literal("dblclick"),
  selector: external_exports.string().min(1)
});
var focusSchema = baseCommandSchema.extend({
  action: external_exports.literal("focus"),
  selector: external_exports.string().min(1)
});
var dragSchema = baseCommandSchema.extend({
  action: external_exports.literal("drag"),
  source: external_exports.string().min(1),
  target: external_exports.string().min(1)
});
var frameSchema = baseCommandSchema.extend({
  action: external_exports.literal("frame"),
  selector: external_exports.string().min(1).optional(),
  name: external_exports.string().optional(),
  url: external_exports.string().optional()
});
var mainframeSchema = baseCommandSchema.extend({
  action: external_exports.literal("mainframe")
});
var getByRoleSchema = baseCommandSchema.extend({
  action: external_exports.literal("getbyrole"),
  role: external_exports.string().min(1),
  name: external_exports.string().optional(),
  exact: external_exports.boolean().optional(),
  subaction: external_exports.enum(["click", "fill", "check", "hover"]),
  value: external_exports.string().optional()
});
var getByTextSchema = baseCommandSchema.extend({
  action: external_exports.literal("getbytext"),
  text: external_exports.string().min(1),
  exact: external_exports.boolean().optional(),
  subaction: external_exports.enum(["click", "hover"])
});
var getByLabelSchema = baseCommandSchema.extend({
  action: external_exports.literal("getbylabel"),
  label: external_exports.string().min(1),
  exact: external_exports.boolean().optional(),
  subaction: external_exports.enum(["click", "fill", "check"]),
  value: external_exports.string().optional()
});
var getByPlaceholderSchema = baseCommandSchema.extend({
  action: external_exports.literal("getbyplaceholder"),
  placeholder: external_exports.string().min(1),
  exact: external_exports.boolean().optional(),
  subaction: external_exports.enum(["click", "fill"]),
  value: external_exports.string().optional()
});
var cookiesGetSchema = baseCommandSchema.extend({
  action: external_exports.literal("cookies_get"),
  urls: external_exports.array(external_exports.string()).optional()
});
var cookiesSetSchema = baseCommandSchema.extend({
  action: external_exports.literal("cookies_set"),
  cookies: external_exports.array(
    external_exports.object({
      name: external_exports.string(),
      value: external_exports.string(),
      url: external_exports.string().optional(),
      domain: external_exports.string().optional(),
      path: external_exports.string().optional(),
      expires: external_exports.number().optional(),
      httpOnly: external_exports.boolean().optional(),
      secure: external_exports.boolean().optional(),
      sameSite: external_exports.enum(["Strict", "Lax", "None"]).optional()
    })
  )
});
var cookiesClearSchema = baseCommandSchema.extend({
  action: external_exports.literal("cookies_clear")
});
var storageGetSchema = baseCommandSchema.extend({
  action: external_exports.literal("storage_get"),
  key: external_exports.string().optional(),
  type: external_exports.enum(["local", "session"])
});
var storageSetSchema = baseCommandSchema.extend({
  action: external_exports.literal("storage_set"),
  key: external_exports.string().min(1),
  value: external_exports.string(),
  type: external_exports.enum(["local", "session"])
});
var storageClearSchema = baseCommandSchema.extend({
  action: external_exports.literal("storage_clear"),
  type: external_exports.enum(["local", "session"])
});
var dialogSchema = baseCommandSchema.extend({
  action: external_exports.literal("dialog"),
  response: external_exports.enum(["accept", "dismiss"]),
  promptText: external_exports.string().optional()
});
var pdfSchema = baseCommandSchema.extend({
  action: external_exports.literal("pdf"),
  path: external_exports.string().min(1),
  format: external_exports.enum(["Letter", "Legal", "Tabloid", "Ledger", "A0", "A1", "A2", "A3", "A4", "A5", "A6"]).optional()
});
var routeSchema = baseCommandSchema.extend({
  action: external_exports.literal("route"),
  url: external_exports.string().min(1),
  response: external_exports.object({
    status: external_exports.number().optional(),
    body: external_exports.string().optional(),
    contentType: external_exports.string().optional(),
    headers: external_exports.record(external_exports.string()).optional()
  }).optional(),
  abort: external_exports.boolean().optional()
});
var unrouteSchema = baseCommandSchema.extend({
  action: external_exports.literal("unroute"),
  url: external_exports.string().optional()
});
var requestsSchema = baseCommandSchema.extend({
  action: external_exports.literal("requests"),
  filter: external_exports.string().optional(),
  clear: external_exports.boolean().optional()
});
var downloadSchema = baseCommandSchema.extend({
  action: external_exports.literal("download"),
  selector: external_exports.string().min(1),
  path: external_exports.string().min(1)
});
var geolocationSchema = baseCommandSchema.extend({
  action: external_exports.literal("geolocation"),
  latitude: external_exports.number(),
  longitude: external_exports.number(),
  accuracy: external_exports.number().optional()
});
var permissionsSchema = baseCommandSchema.extend({
  action: external_exports.literal("permissions"),
  permissions: external_exports.array(external_exports.string()),
  grant: external_exports.boolean()
});
var viewportSchema = baseCommandSchema.extend({
  action: external_exports.literal("viewport"),
  width: external_exports.number().positive(),
  height: external_exports.number().positive(),
  deviceScaleFactor: external_exports.number().positive().optional()
});
var userAgentSchema = baseCommandSchema.extend({
  action: external_exports.literal("useragent"),
  userAgent: external_exports.string().min(1)
});
var deviceSchema = baseCommandSchema.extend({
  action: external_exports.literal("device"),
  device: external_exports.string().min(1)
});
var backSchema = baseCommandSchema.extend({
  action: external_exports.literal("back")
});
var forwardSchema = baseCommandSchema.extend({
  action: external_exports.literal("forward")
});
var reloadSchema = baseCommandSchema.extend({
  action: external_exports.literal("reload")
});
var urlSchema = baseCommandSchema.extend({
  action: external_exports.literal("url")
});
var titleSchema = baseCommandSchema.extend({
  action: external_exports.literal("title")
});
var getAttributeSchema = baseCommandSchema.extend({
  action: external_exports.literal("getattribute"),
  selector: external_exports.string().min(1),
  attribute: external_exports.string().min(1)
});
var getTextSchema = baseCommandSchema.extend({
  action: external_exports.literal("gettext"),
  selector: external_exports.string().min(1)
});
var isVisibleSchema = baseCommandSchema.extend({
  action: external_exports.literal("isvisible"),
  selector: external_exports.string().min(1)
});
var isEnabledSchema = baseCommandSchema.extend({
  action: external_exports.literal("isenabled"),
  selector: external_exports.string().min(1)
});
var isCheckedSchema = baseCommandSchema.extend({
  action: external_exports.literal("ischecked"),
  selector: external_exports.string().min(1)
});
var countSchema = baseCommandSchema.extend({
  action: external_exports.literal("count"),
  selector: external_exports.string().min(1)
});
var boundingBoxSchema = baseCommandSchema.extend({
  action: external_exports.literal("boundingbox"),
  selector: external_exports.string().min(1)
});
var stylesSchema = baseCommandSchema.extend({
  action: external_exports.literal("styles"),
  selector: external_exports.string().min(1)
});
var videoStartSchema = baseCommandSchema.extend({
  action: external_exports.literal("video_start"),
  path: external_exports.string().min(1)
});
var videoStopSchema = baseCommandSchema.extend({
  action: external_exports.literal("video_stop")
});
var recordingStartSchema = baseCommandSchema.extend({
  action: external_exports.literal("recording_start"),
  path: external_exports.string().min(1),
  url: external_exports.string().min(1).optional()
});
var recordingStopSchema = baseCommandSchema.extend({
  action: external_exports.literal("recording_stop")
});
var recordingRestartSchema = baseCommandSchema.extend({
  action: external_exports.literal("recording_restart"),
  path: external_exports.string().min(1),
  url: external_exports.string().min(1).optional()
});
var traceStartSchema = baseCommandSchema.extend({
  action: external_exports.literal("trace_start"),
  screenshots: external_exports.boolean().optional(),
  snapshots: external_exports.boolean().optional()
});
var traceStopSchema = baseCommandSchema.extend({
  action: external_exports.literal("trace_stop"),
  path: external_exports.string().min(1).optional()
});
var profilerStartSchema = baseCommandSchema.extend({
  action: external_exports.literal("profiler_start"),
  categories: external_exports.array(external_exports.string()).optional()
});
var profilerStopSchema = baseCommandSchema.extend({
  action: external_exports.literal("profiler_stop"),
  path: external_exports.string().min(1).optional()
});
var harStartSchema = baseCommandSchema.extend({
  action: external_exports.literal("har_start")
});
var harStopSchema = baseCommandSchema.extend({
  action: external_exports.literal("har_stop"),
  path: external_exports.string().min(1)
});
var stateSaveSchema = baseCommandSchema.extend({
  action: external_exports.literal("state_save"),
  path: external_exports.string().min(1)
});
var stateLoadSchema = baseCommandSchema.extend({
  action: external_exports.literal("state_load"),
  path: external_exports.string().min(1)
});
var stateListSchema = baseCommandSchema.extend({
  action: external_exports.literal("state_list")
});
var stateClearSchema = baseCommandSchema.extend({
  action: external_exports.literal("state_clear"),
  sessionName: external_exports.string().optional(),
  all: external_exports.boolean().optional()
});
var stateShowSchema = baseCommandSchema.extend({
  action: external_exports.literal("state_show"),
  filename: external_exports.string().min(1)
});
var stateCleanSchema = baseCommandSchema.extend({
  action: external_exports.literal("state_clean"),
  days: external_exports.number().int().positive()
});
var stateRenameSchema = baseCommandSchema.extend({
  action: external_exports.literal("state_rename"),
  oldName: external_exports.string().min(1),
  newName: external_exports.string().min(1)
});
var consoleSchema = baseCommandSchema.extend({
  action: external_exports.literal("console"),
  clear: external_exports.boolean().optional()
});
var errorsSchema = baseCommandSchema.extend({
  action: external_exports.literal("errors"),
  clear: external_exports.boolean().optional()
});
var keyboardSchema = baseCommandSchema.extend({
  action: external_exports.literal("keyboard"),
  subaction: external_exports.enum(["type", "press", "insertText"]).optional(),
  keys: external_exports.string().min(1).optional(),
  text: external_exports.string().min(1).optional(),
  delay: external_exports.number().optional()
});
var wheelSchema = baseCommandSchema.extend({
  action: external_exports.literal("wheel"),
  deltaX: external_exports.number().optional(),
  deltaY: external_exports.number().optional(),
  selector: external_exports.string().optional()
});
var tapSchema = baseCommandSchema.extend({
  action: external_exports.literal("tap"),
  selector: external_exports.string().min(1)
});
var clipboardSchema = baseCommandSchema.extend({
  action: external_exports.literal("clipboard"),
  operation: external_exports.enum(["copy", "paste", "read"]),
  text: external_exports.string().optional()
});
var highlightSchema = baseCommandSchema.extend({
  action: external_exports.literal("highlight"),
  selector: external_exports.string().min(1)
});
var clearSchema = baseCommandSchema.extend({
  action: external_exports.literal("clear"),
  selector: external_exports.string().min(1)
});
var selectAllSchema = baseCommandSchema.extend({
  action: external_exports.literal("selectall"),
  selector: external_exports.string().min(1)
});
var innerTextSchema = baseCommandSchema.extend({
  action: external_exports.literal("innertext"),
  selector: external_exports.string().min(1)
});
var innerHtmlSchema = baseCommandSchema.extend({
  action: external_exports.literal("innerhtml"),
  selector: external_exports.string().min(1)
});
var inputValueSchema = baseCommandSchema.extend({
  action: external_exports.literal("inputvalue"),
  selector: external_exports.string().min(1)
});
var setValueSchema = baseCommandSchema.extend({
  action: external_exports.literal("setvalue"),
  selector: external_exports.string().min(1),
  value: external_exports.string()
});
var dispatchSchema = baseCommandSchema.extend({
  action: external_exports.literal("dispatch"),
  selector: external_exports.string().min(1),
  event: external_exports.string().min(1),
  eventInit: external_exports.record(external_exports.unknown()).optional()
});
var evalHandleSchema = baseCommandSchema.extend({
  action: external_exports.literal("evalhandle"),
  script: external_exports.string().min(1)
});
var exposeSchema = baseCommandSchema.extend({
  action: external_exports.literal("expose"),
  name: external_exports.string().min(1)
});
var addScriptSchema = baseCommandSchema.extend({
  action: external_exports.literal("addscript"),
  content: external_exports.string().optional(),
  url: external_exports.string().optional()
});
var addStyleSchema = baseCommandSchema.extend({
  action: external_exports.literal("addstyle"),
  content: external_exports.string().optional(),
  url: external_exports.string().optional()
});
var emulateMediaSchema = baseCommandSchema.extend({
  action: external_exports.literal("emulatemedia"),
  media: external_exports.enum(["screen", "print"]).nullable().optional(),
  colorScheme: external_exports.enum(["light", "dark", "no-preference"]).nullable().optional(),
  reducedMotion: external_exports.enum(["reduce", "no-preference"]).nullable().optional(),
  forcedColors: external_exports.enum(["active", "none"]).nullable().optional()
});
var offlineSchema = baseCommandSchema.extend({
  action: external_exports.literal("offline"),
  offline: external_exports.boolean()
});
var headersSchema = baseCommandSchema.extend({
  action: external_exports.literal("headers"),
  headers: external_exports.record(external_exports.string())
});
var pauseSchema = baseCommandSchema.extend({
  action: external_exports.literal("pause")
});
var getByAltTextSchema = baseCommandSchema.extend({
  action: external_exports.literal("getbyalttext"),
  text: external_exports.string().min(1),
  exact: external_exports.boolean().optional(),
  subaction: external_exports.enum(["click", "hover"])
});
var getByTitleSchema = baseCommandSchema.extend({
  action: external_exports.literal("getbytitle"),
  text: external_exports.string().min(1),
  exact: external_exports.boolean().optional(),
  subaction: external_exports.enum(["click", "hover"])
});
var getByTestIdSchema = baseCommandSchema.extend({
  action: external_exports.literal("getbytestid"),
  testId: external_exports.string().min(1),
  subaction: external_exports.enum(["click", "fill", "check", "hover"]),
  value: external_exports.string().optional()
});
var nthSchema = baseCommandSchema.extend({
  action: external_exports.literal("nth"),
  selector: external_exports.string().min(1),
  index: external_exports.number(),
  subaction: external_exports.enum(["click", "fill", "check", "hover", "text"]),
  value: external_exports.string().optional()
});
var waitForUrlSchema = baseCommandSchema.extend({
  action: external_exports.literal("waitforurl"),
  url: external_exports.string().min(1),
  timeout: external_exports.number().positive().optional()
});
var waitForLoadStateSchema = baseCommandSchema.extend({
  action: external_exports.literal("waitforloadstate"),
  state: external_exports.enum(["load", "domcontentloaded", "networkidle"]),
  timeout: external_exports.number().positive().optional()
});
var setContentSchema = baseCommandSchema.extend({
  action: external_exports.literal("setcontent"),
  html: external_exports.string()
});
var timezoneSchema = baseCommandSchema.extend({
  action: external_exports.literal("timezone"),
  timezone: external_exports.string().min(1)
});
var localeSchema = baseCommandSchema.extend({
  action: external_exports.literal("locale"),
  locale: external_exports.string().min(1)
});
var credentialsSchema = baseCommandSchema.extend({
  action: external_exports.literal("credentials"),
  username: external_exports.string(),
  password: external_exports.string()
});
var mouseMoveSchema = baseCommandSchema.extend({
  action: external_exports.literal("mousemove"),
  x: external_exports.number(),
  y: external_exports.number()
});
var mouseDownSchema = baseCommandSchema.extend({
  action: external_exports.literal("mousedown"),
  button: external_exports.enum(["left", "right", "middle"]).optional()
});
var mouseUpSchema = baseCommandSchema.extend({
  action: external_exports.literal("mouseup"),
  button: external_exports.enum(["left", "right", "middle"]).optional()
});
var bringToFrontSchema = baseCommandSchema.extend({
  action: external_exports.literal("bringtofront")
});
var waitForFunctionSchema = baseCommandSchema.extend({
  action: external_exports.literal("waitforfunction"),
  expression: external_exports.string().min(1),
  timeout: external_exports.number().positive().optional()
});
var scrollIntoViewSchema = baseCommandSchema.extend({
  action: external_exports.literal("scrollintoview"),
  selector: external_exports.string().min(1)
});
var addInitScriptSchema = baseCommandSchema.extend({
  action: external_exports.literal("addinitscript"),
  script: external_exports.string().min(1)
});
var keyDownSchema = baseCommandSchema.extend({
  action: external_exports.literal("keydown"),
  key: external_exports.string().min(1)
});
var keyUpSchema = baseCommandSchema.extend({
  action: external_exports.literal("keyup"),
  key: external_exports.string().min(1)
});
var insertTextSchema = baseCommandSchema.extend({
  action: external_exports.literal("inserttext"),
  text: external_exports.string()
});
var multiSelectSchema = baseCommandSchema.extend({
  action: external_exports.literal("multiselect"),
  selector: external_exports.string().min(1),
  values: external_exports.array(external_exports.string())
});
var waitForDownloadSchema = baseCommandSchema.extend({
  action: external_exports.literal("waitfordownload"),
  path: external_exports.string().optional(),
  timeout: external_exports.number().positive().optional()
});
var responseBodySchema = baseCommandSchema.extend({
  action: external_exports.literal("responsebody"),
  url: external_exports.string().min(1),
  timeout: external_exports.number().positive().optional()
});
var screencastStartSchema = baseCommandSchema.extend({
  action: external_exports.literal("screencast_start"),
  format: external_exports.enum(["jpeg", "png"]).optional(),
  quality: external_exports.number().min(0).max(100).optional(),
  maxWidth: external_exports.number().positive().optional(),
  maxHeight: external_exports.number().positive().optional(),
  everyNthFrame: external_exports.number().positive().optional()
});
var screencastStopSchema = baseCommandSchema.extend({
  action: external_exports.literal("screencast_stop")
});
var inputMouseSchema = baseCommandSchema.extend({
  action: external_exports.literal("input_mouse"),
  type: external_exports.enum(["mousePressed", "mouseReleased", "mouseMoved", "mouseWheel"]),
  x: external_exports.number(),
  y: external_exports.number(),
  button: external_exports.enum(["left", "right", "middle", "none"]).optional(),
  clickCount: external_exports.number().positive().optional(),
  deltaX: external_exports.number().optional(),
  deltaY: external_exports.number().optional(),
  modifiers: external_exports.number().optional()
});
var inputKeyboardSchema = baseCommandSchema.extend({
  action: external_exports.literal("input_keyboard"),
  type: external_exports.enum(["keyDown", "keyUp", "char"]),
  key: external_exports.string().optional(),
  code: external_exports.string().optional(),
  text: external_exports.string().optional(),
  modifiers: external_exports.number().optional()
});
var inputTouchSchema = baseCommandSchema.extend({
  action: external_exports.literal("input_touch"),
  type: external_exports.enum(["touchStart", "touchEnd", "touchMove", "touchCancel"]),
  touchPoints: external_exports.array(
    external_exports.object({
      x: external_exports.number(),
      y: external_exports.number(),
      id: external_exports.number().optional()
    })
  ),
  modifiers: external_exports.number().optional()
});
var swipeSchema = baseCommandSchema.extend({
  action: external_exports.literal("swipe"),
  direction: external_exports.enum(["up", "down", "left", "right"]),
  distance: external_exports.number().positive().optional()
});
var deviceListSchema = baseCommandSchema.extend({
  action: external_exports.literal("device_list")
});
var diffSnapshotSchema = baseCommandSchema.extend({
  action: external_exports.literal("diff_snapshot"),
  baseline: external_exports.string().optional(),
  selector: external_exports.string().optional(),
  compact: external_exports.boolean().optional(),
  maxDepth: external_exports.number().nonnegative().optional()
});
var diffScreenshotSchema = baseCommandSchema.extend({
  action: external_exports.literal("diff_screenshot"),
  baseline: external_exports.string().min(1),
  output: external_exports.string().optional(),
  threshold: external_exports.number().min(0).max(1).optional(),
  selector: external_exports.string().min(1).optional(),
  fullPage: external_exports.boolean().optional()
});
var diffUrlSchema = baseCommandSchema.extend({
  action: external_exports.literal("diff_url"),
  url1: external_exports.string().min(1),
  url2: external_exports.string().min(1),
  screenshot: external_exports.boolean().optional(),
  fullPage: external_exports.boolean().optional(),
  waitUntil: external_exports.enum(["load", "domcontentloaded", "networkidle"]).optional(),
  selector: external_exports.string().optional(),
  compact: external_exports.boolean().optional(),
  maxDepth: external_exports.number().nonnegative().optional()
});
var pressSchema = baseCommandSchema.extend({
  action: external_exports.literal("press"),
  key: external_exports.string().min(1),
  selector: external_exports.string().min(1).optional()
});
var screenshotSchema = baseCommandSchema.extend({
  action: external_exports.literal("screenshot"),
  path: external_exports.string().nullable().optional(),
  fullPage: external_exports.boolean().optional(),
  selector: external_exports.string().min(1).nullish(),
  format: external_exports.enum(["png", "jpeg"]).optional(),
  quality: external_exports.number().min(0).max(100).optional(),
  annotate: external_exports.boolean().optional()
});
var snapshotSchema = baseCommandSchema.extend({
  action: external_exports.literal("snapshot"),
  interactive: external_exports.boolean().optional(),
  cursor: external_exports.boolean().optional(),
  maxDepth: external_exports.number().nonnegative().optional(),
  compact: external_exports.boolean().optional(),
  selector: external_exports.string().optional()
});
var evaluateSchema = baseCommandSchema.extend({
  action: external_exports.literal("evaluate"),
  script: external_exports.string().min(1),
  args: external_exports.array(external_exports.unknown()).optional()
});
var waitSchema = baseCommandSchema.extend({
  action: external_exports.literal("wait"),
  selector: external_exports.string().min(1).optional(),
  timeout: external_exports.number().positive().optional(),
  state: external_exports.enum(["attached", "detached", "visible", "hidden"]).optional()
});
var scrollSchema = baseCommandSchema.extend({
  action: external_exports.literal("scroll"),
  selector: external_exports.string().min(1).optional(),
  x: external_exports.number().optional(),
  y: external_exports.number().optional(),
  direction: external_exports.enum(["up", "down", "left", "right"]).optional(),
  amount: external_exports.number().positive().optional()
});
var selectSchema = baseCommandSchema.extend({
  action: external_exports.literal("select"),
  selector: external_exports.string().min(1),
  values: external_exports.union([external_exports.string(), external_exports.array(external_exports.string())])
});
var hoverSchema = baseCommandSchema.extend({
  action: external_exports.literal("hover"),
  selector: external_exports.string().min(1)
});
var contentSchema = baseCommandSchema.extend({
  action: external_exports.literal("content"),
  selector: external_exports.string().min(1).optional()
});
var closeSchema = baseCommandSchema.extend({
  action: external_exports.literal("close")
});
var tabNewSchema = baseCommandSchema.extend({
  action: external_exports.literal("tab_new"),
  url: external_exports.string().min(1).optional()
});
var tabListSchema = baseCommandSchema.extend({
  action: external_exports.literal("tab_list")
});
var tabSwitchSchema = baseCommandSchema.extend({
  action: external_exports.literal("tab_switch"),
  index: external_exports.number().nonnegative()
});
var tabCloseSchema = baseCommandSchema.extend({
  action: external_exports.literal("tab_close"),
  index: external_exports.number().nonnegative().optional()
});
var windowNewSchema = baseCommandSchema.extend({
  action: external_exports.literal("window_new"),
  viewport: external_exports.object({
    width: external_exports.number().positive(),
    height: external_exports.number().positive()
  }).nullable().optional()
});
var authProfileName = external_exports.string().min(1).regex(/^[a-zA-Z0-9_-]+$/, {
  message: "Profile name must contain only alphanumeric characters, hyphens, and underscores"
});
var authSaveSchema = baseCommandSchema.extend({
  action: external_exports.literal("auth_save"),
  name: authProfileName,
  url: external_exports.string().min(1),
  username: external_exports.string().min(1),
  password: external_exports.string().min(1),
  usernameSelector: external_exports.string().optional(),
  passwordSelector: external_exports.string().optional(),
  submitSelector: external_exports.string().optional()
});
var authLoginSchema = baseCommandSchema.extend({
  action: external_exports.literal("auth_login"),
  name: authProfileName
});
var authListSchema = baseCommandSchema.extend({
  action: external_exports.literal("auth_list")
});
var authDeleteSchema = baseCommandSchema.extend({
  action: external_exports.literal("auth_delete"),
  name: authProfileName
});
var authShowSchema = baseCommandSchema.extend({
  action: external_exports.literal("auth_show"),
  name: authProfileName
});
var confirmSchema = baseCommandSchema.extend({
  action: external_exports.literal("confirm"),
  confirmationId: external_exports.string().min(1)
});
var denySchema = baseCommandSchema.extend({
  action: external_exports.literal("deny"),
  confirmationId: external_exports.string().min(1)
});
var commandSchema = external_exports.discriminatedUnion("action", [
  launchSchema,
  navigateSchema,
  clickSchema,
  typeSchema,
  fillSchema,
  checkSchema,
  uncheckSchema,
  uploadSchema,
  dblclickSchema,
  focusSchema,
  dragSchema,
  frameSchema,
  mainframeSchema,
  getByRoleSchema,
  getByTextSchema,
  getByLabelSchema,
  getByPlaceholderSchema,
  pressSchema,
  screenshotSchema,
  snapshotSchema,
  evaluateSchema,
  waitSchema,
  scrollSchema,
  selectSchema,
  hoverSchema,
  contentSchema,
  closeSchema,
  tabNewSchema,
  tabListSchema,
  tabSwitchSchema,
  tabCloseSchema,
  windowNewSchema,
  cookiesGetSchema,
  cookiesSetSchema,
  cookiesClearSchema,
  storageGetSchema,
  storageSetSchema,
  storageClearSchema,
  dialogSchema,
  pdfSchema,
  routeSchema,
  unrouteSchema,
  requestsSchema,
  downloadSchema,
  geolocationSchema,
  permissionsSchema,
  viewportSchema,
  userAgentSchema,
  deviceSchema,
  backSchema,
  forwardSchema,
  reloadSchema,
  urlSchema,
  titleSchema,
  getAttributeSchema,
  getTextSchema,
  isVisibleSchema,
  isEnabledSchema,
  isCheckedSchema,
  countSchema,
  boundingBoxSchema,
  stylesSchema,
  videoStartSchema,
  videoStopSchema,
  recordingStartSchema,
  recordingStopSchema,
  recordingRestartSchema,
  traceStartSchema,
  traceStopSchema,
  profilerStartSchema,
  profilerStopSchema,
  harStartSchema,
  harStopSchema,
  stateSaveSchema,
  stateLoadSchema,
  stateListSchema,
  stateClearSchema,
  stateShowSchema,
  stateCleanSchema,
  stateRenameSchema,
  consoleSchema,
  errorsSchema,
  keyboardSchema,
  wheelSchema,
  tapSchema,
  clipboardSchema,
  highlightSchema,
  clearSchema,
  selectAllSchema,
  innerTextSchema,
  innerHtmlSchema,
  inputValueSchema,
  setValueSchema,
  dispatchSchema,
  evalHandleSchema,
  exposeSchema,
  addScriptSchema,
  addStyleSchema,
  emulateMediaSchema,
  offlineSchema,
  headersSchema,
  pauseSchema,
  getByAltTextSchema,
  getByTitleSchema,
  getByTestIdSchema,
  nthSchema,
  waitForUrlSchema,
  waitForLoadStateSchema,
  setContentSchema,
  timezoneSchema,
  localeSchema,
  credentialsSchema,
  mouseMoveSchema,
  mouseDownSchema,
  mouseUpSchema,
  bringToFrontSchema,
  waitForFunctionSchema,
  scrollIntoViewSchema,
  addInitScriptSchema,
  keyDownSchema,
  keyUpSchema,
  insertTextSchema,
  multiSelectSchema,
  waitForDownloadSchema,
  responseBodySchema,
  screencastStartSchema,
  screencastStopSchema,
  inputMouseSchema,
  inputKeyboardSchema,
  inputTouchSchema,
  swipeSchema,
  deviceListSchema,
  diffSnapshotSchema,
  diffScreenshotSchema,
  diffUrlSchema,
  confirmSchema,
  denySchema,
  authSaveSchema,
  authLoginSchema,
  authListSchema,
  authDeleteSchema,
  authShowSchema
]);
function parseCommand(input) {
  let json;
  try {
    json = JSON.parse(input);
  } catch {
    return { success: false, error: "Invalid JSON" };
  }
  const id = typeof json === "object" && json !== null && "id" in json ? String(json.id) : void 0;
  const result = commandSchema.safeParse(json);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
    return { success: false, error: `Validation error: ${errors}`, id };
  }
  const command2 = result.data;
  if ((command2.action === "addscript" || command2.action === "addstyle") && !command2.content && !command2.url) {
    return { success: false, error: "Either content or url must be provided", id };
  }
  if (command2.action === "frame" && !command2.selector && !command2.name && !command2.url) {
    return {
      success: false,
      error: "frame command requires at least one of: selector, name, or url",
      id
    };
  }
  if (command2.action === "keyboard") {
    const sub = command2.subaction ?? "press";
    if ((sub === "type" || sub === "insertText") && !command2.text) {
      return { success: false, error: `keyboard ${sub} requires text`, id };
    }
    if (sub === "press" && !command2.keys) {
      return { success: false, error: "keyboard press requires keys", id };
    }
  }
  return { success: true, command: command2 };
}
function successResponse(id, data) {
  return { id, success: true, data };
}
function errorResponse(id, error) {
  return { id, success: false, error };
}
function serializeResponse(response) {
  return JSON.stringify(response);
}

// src/actions.ts
var fs2 = __toESM(require("fs"), 1);
var path5 = __toESM(require("path"), 1);
var import_node_fs5 = require("node:fs");

// src/action-policy.ts
var import_node_fs3 = require("node:fs");
var import_node_path3 = require("node:path");
var ACTION_CATEGORIES = {
  navigate: "navigate",
  back: "navigate",
  forward: "navigate",
  reload: "navigate",
  tab_new: "navigate",
  click: "click",
  dblclick: "click",
  tap: "click",
  fill: "fill",
  type: "fill",
  // The `keyboard` action is a compound command that dispatches to sub-actions
  // (type, inserttext, press, down, up). Its primary use is text input, so it
  // maps to 'fill'. The interact-like sub-actions (press, down, up) are less
  // common and don't have separate top-level action names in the protocol.
  keyboard: "fill",
  inserttext: "fill",
  select: "fill",
  multiselect: "fill",
  check: "fill",
  uncheck: "fill",
  clear: "fill",
  selectall: "fill",
  setvalue: "fill",
  download: "download",
  waitfordownload: "download",
  upload: "upload",
  evaluate: "eval",
  evalhandle: "eval",
  addscript: "eval",
  addinitscript: "eval",
  snapshot: "snapshot",
  screenshot: "snapshot",
  pdf: "snapshot",
  diff_snapshot: "snapshot",
  diff_screenshot: "snapshot",
  diff_url: "snapshot",
  scroll: "scroll",
  scrollintoview: "scroll",
  wait: "wait",
  waitforurl: "wait",
  waitforloadstate: "wait",
  waitforfunction: "wait",
  gettext: "get",
  content: "get",
  innerhtml: "get",
  innertext: "get",
  inputvalue: "get",
  url: "get",
  title: "get",
  getattribute: "get",
  count: "get",
  boundingbox: "get",
  styles: "get",
  isvisible: "get",
  isenabled: "get",
  ischecked: "get",
  responsebody: "get",
  route: "network",
  unroute: "network",
  requests: "network",
  state_save: "state",
  state_load: "state",
  cookies_set: "state",
  storage_set: "state",
  credentials: "state",
  hover: "interact",
  focus: "interact",
  drag: "interact",
  press: "interact",
  keydown: "interact",
  keyup: "interact",
  mousemove: "interact",
  mousedown: "interact",
  mouseup: "interact",
  wheel: "interact",
  dispatch: "interact",
  // These are always allowed (internal/meta operations)
  launch: "_internal",
  close: "_internal",
  tab_list: "_internal",
  tab_switch: "_internal",
  tab_close: "_internal",
  window_new: "_internal",
  frame: "_internal",
  mainframe: "_internal",
  dialog: "_internal",
  session: "_internal",
  console: "_internal",
  errors: "_internal",
  cookies_get: "_internal",
  cookies_clear: "_internal",
  storage_get: "_internal",
  storage_clear: "_internal",
  state_list: "_internal",
  state_show: "_internal",
  state_clear: "_internal",
  state_clean: "_internal",
  state_rename: "_internal",
  highlight: "_internal",
  bringtofront: "_internal",
  trace_start: "_internal",
  trace_stop: "_internal",
  har_start: "_internal",
  har_stop: "_internal",
  video_start: "_internal",
  video_stop: "_internal",
  recording_start: "_internal",
  recording_stop: "_internal",
  recording_restart: "_internal",
  profiler_start: "_internal",
  profiler_stop: "_internal",
  clipboard: "_internal",
  viewport: "_internal",
  useragent: "_internal",
  device: "_internal",
  geolocation: "_internal",
  permissions: "_internal",
  emulatemedia: "_internal",
  offline: "_internal",
  headers: "_internal",
  addstyle: "eval",
  expose: "eval",
  timezone: "_internal",
  locale: "_internal",
  pause: "_internal",
  setcontent: "eval",
  screencast_start: "_internal",
  screencast_stop: "_internal",
  input_mouse: "_internal",
  input_keyboard: "_internal",
  input_touch: "_internal",
  auth_save: "_internal",
  auth_login: "_internal",
  auth_list: "_internal",
  auth_delete: "_internal",
  auth_show: "_internal",
  confirm: "_internal",
  deny: "_internal",
  // Find/semantic locator actions (read-only element resolution)
  getbyrole: "get",
  getbytext: "get",
  getbylabel: "get",
  getbyplaceholder: "get",
  getbyalttext: "get",
  getbytitle: "get",
  getbytestid: "get",
  nth: "get"
};
var KNOWN_CATEGORIES = new Set(
  Object.values(ACTION_CATEGORIES).filter((c) => c !== "_internal")
);
function getActionCategory(action) {
  return ACTION_CATEGORIES[action] ?? "unknown";
}
function loadPolicyFile(policyPath) {
  const resolved = (0, import_node_path3.resolve)(policyPath);
  const content = (0, import_node_fs3.readFileSync)(resolved, "utf-8");
  const policy = JSON.parse(content);
  if (policy.default !== "allow" && policy.default !== "deny") {
    throw new Error(
      `Invalid action policy: "default" must be "allow" or "deny", got "${policy.default}"`
    );
  }
  for (const list of [policy.allow, policy.deny]) {
    if (!list) continue;
    for (const category of list) {
      if (!KNOWN_CATEGORIES.has(category)) {
        console.warn(
          `[agent-browser] Warning: unrecognized action category "${category}" in policy file. Known categories: ${[...KNOWN_CATEGORIES].sort().join(", ")}`
        );
      }
    }
  }
  return policy;
}
var cachedPolicyPath = null;
var cachedPolicyMtimeMs = 0;
var cachedPolicy = null;
var RELOAD_CHECK_INTERVAL_MS = 5e3;
var lastCheckMs = 0;
function initPolicyReloader(policyPath, policy) {
  cachedPolicyPath = (0, import_node_path3.resolve)(policyPath);
  cachedPolicyMtimeMs = (0, import_node_fs3.statSync)(cachedPolicyPath).mtimeMs;
  cachedPolicy = policy;
}
function reloadPolicyIfChanged() {
  if (!cachedPolicyPath) return cachedPolicy;
  const now = Date.now();
  if (now - lastCheckMs < RELOAD_CHECK_INTERVAL_MS) return cachedPolicy;
  lastCheckMs = now;
  try {
    const currentMtime = (0, import_node_fs3.statSync)(cachedPolicyPath).mtimeMs;
    if (currentMtime !== cachedPolicyMtimeMs) {
      cachedPolicy = loadPolicyFile(cachedPolicyPath);
      cachedPolicyMtimeMs = currentMtime;
    }
  } catch {
  }
  return cachedPolicy;
}
function checkPolicy(action, policy, confirmCategories2) {
  const category = getActionCategory(action);
  if (category === "_internal") return "allow";
  if (policy?.deny?.includes(category)) return "deny";
  if (confirmCategories2.has(category)) return "confirm";
  if (!policy) return "allow";
  if (policy.allow?.includes(category)) return "allow";
  return policy.default;
}
function describeAction(action, command2) {
  const category = getActionCategory(action);
  switch (action) {
    case "navigate":
      return `Navigate to ${command2.url}`;
    case "evaluate":
    case "evalhandle":
      return `Evaluate JavaScript: ${String(command2.script ?? "").slice(0, 80)}`;
    case "fill":
      return `Fill ${command2.selector}`;
    case "type":
      return `Type into ${command2.selector}`;
    case "click":
      return `Click ${command2.selector}`;
    case "dblclick":
      return `Double-click ${command2.selector}`;
    case "tap":
      return `Tap ${command2.selector}`;
    case "download":
      return `Download via ${command2.selector} to ${command2.path}`;
    case "upload":
      return `Upload files to ${command2.selector}`;
    default:
      return `${category}: ${action}`;
  }
}

// src/confirmation.ts
var import_node_crypto = require("node:crypto");
var AUTO_DENY_TIMEOUT_MS = 6e4;
var pending = /* @__PURE__ */ new Map();
function generateId() {
  return `c_${(0, import_node_crypto.randomBytes)(8).toString("hex")}`;
}
function requestConfirmation(action, category, description, command2) {
  const id = generateId();
  const timer = setTimeout(() => {
    pending.delete(id);
  }, AUTO_DENY_TIMEOUT_MS);
  pending.set(id, {
    id,
    action,
    category,
    description,
    command: command2,
    timer
  });
  return { confirmationId: id };
}
function getAndRemovePending(id) {
  const entry = pending.get(id);
  if (!entry) return null;
  clearTimeout(entry.timer);
  pending.delete(id);
  return { command: entry.command, action: entry.action };
}

// src/auth-vault.ts
var import_node_fs4 = require("node:fs");
var import_node_path4 = __toESM(require("node:path"), 1);
var import_node_os3 = __toESM(require("node:os"), 1);
var AUTH_DIR = "auth";
function getAuthDir() {
  const dir = import_node_path4.default.join(import_node_os3.default.homedir(), ".agent-browser", AUTH_DIR);
  if (!(0, import_node_fs4.existsSync)(dir)) {
    (0, import_node_fs4.mkdirSync)(dir, { recursive: true, mode: 448 });
    restrictDirPermissions(dir);
  }
  return dir;
}
var SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/;
function validateProfileName(name) {
  if (!SAFE_NAME_RE.test(name)) {
    throw new Error(
      `Invalid auth profile name '${name}': only alphanumeric characters, hyphens, and underscores are allowed`
    );
  }
}
function profilePath(name) {
  validateProfileName(name);
  return import_node_path4.default.join(getAuthDir(), `${name}.json`);
}
function readProfile(name) {
  const p = profilePath(name);
  if (!(0, import_node_fs4.existsSync)(p)) return null;
  const raw = (0, import_node_fs4.readFileSync)(p, "utf-8");
  const parsed = JSON.parse(raw);
  if (isEncryptedPayload(parsed)) {
    const key = getEncryptionKey();
    if (!key) {
      throw new Error(
        `Encryption key required to read encrypted auth profiles. Set AGENT_BROWSER_ENCRYPTION_KEY or ensure ${getKeyFilePath()} exists.`
      );
    }
    const decrypted = decryptData(parsed, key);
    return JSON.parse(decrypted);
  }
  return parsed;
}
function writeProfile(profile) {
  const key = ensureEncryptionKey();
  const serialized = JSON.stringify(profile, null, 2);
  const encrypted = encryptData(serialized, key);
  const filePath = profilePath(profile.name);
  (0, import_node_fs4.writeFileSync)(filePath, JSON.stringify(encrypted, null, 2), {
    mode: 384
  });
  restrictFilePermissions(filePath);
}
function getAuthProfile(name) {
  return readProfile(name);
}
function updateLastLogin(name) {
  const profile = readProfile(name);
  if (profile) {
    profile.lastLoginAt = (/* @__PURE__ */ new Date()).toISOString();
    writeProfile(profile);
  }
}

// src/diff.ts
var import_promises2 = require("node:fs/promises");
var import_node_path5 = __toESM(require("node:path"), 1);
function myersDiff(a, b) {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  if (max === 0) return [];
  if (n === m) {
    let identical = true;
    for (let i = 0; i < n; i++) {
      if (a[i] !== b[i]) {
        identical = false;
        break;
      }
    }
    if (identical) return a.map((line) => ({ type: "equal", line }));
  }
  const vSize = 2 * max + 1;
  const v = new Int32Array(vSize);
  v.fill(-1);
  const trace = [];
  v[max + 1] = 0;
  for (let d = 0; d <= max; d++) {
    const snapshot = new Int32Array(v);
    trace.push(snapshot);
    for (let k = -d; k <= d; k += 2) {
      const idx = k + max;
      let x;
      if (k === -d || k !== d && v[idx - 1] < v[idx + 1]) {
        x = v[idx + 1];
      } else {
        x = v[idx - 1] + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[idx] = x;
      if (x >= n && y >= m) {
        return buildEditScript(trace, a, b, max);
      }
    }
  }
  return buildEditScript(trace, a, b, max);
}
function buildEditScript(trace, a, b, max) {
  const edits = [];
  let x = a.length;
  let y = b.length;
  for (let d = trace.length - 1; d > 0; d--) {
    const v = trace[d];
    const k = x - y;
    const idx = k + max;
    let prevK;
    if (k === -d || k !== d && v[idx - 1] < v[idx + 1]) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevIdx = prevK + max;
    let prevX = v[prevIdx];
    let prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
      edits.push({ type: "equal", line: a[x] });
    }
    if (x === prevX) {
      y--;
      edits.push({ type: "insert", line: b[y] });
    } else {
      x--;
      edits.push({ type: "delete", line: a[x] });
    }
  }
  while (x > 0 && y > 0) {
    x--;
    y--;
    edits.push({ type: "equal", line: a[x] });
  }
  edits.reverse();
  return edits;
}
function diffSnapshots(before, after) {
  const linesA = before.split("\n");
  const linesB = after.split("\n");
  const edits = myersDiff(linesA, linesB);
  let additions = 0;
  let removals = 0;
  let unchanged = 0;
  const diffLines = [];
  for (const edit of edits) {
    switch (edit.type) {
      case "equal":
        unchanged++;
        diffLines.push(`  ${edit.line}`);
        break;
      case "insert":
        additions++;
        diffLines.push(`+ ${edit.line}`);
        break;
      case "delete":
        removals++;
        diffLines.push(`- ${edit.line}`);
        break;
    }
  }
  return {
    diff: diffLines.join("\n"),
    additions,
    removals,
    unchanged,
    changed: additions > 0 || removals > 0
  };
}
var DIFF_ROUTE_PREFIX = "https://agent-browser-diff.localhost";
async function diffScreenshots(context, baselineBuffer, currentBuffer, opts) {
  const baselineMime = opts.baselineMime ?? "image/png";
  const threshold = opts.threshold ?? 0.1;
  const nonce = Math.random().toString(36).slice(2, 10);
  const blankUrl = `${DIFF_ROUTE_PREFIX}/${nonce}/index.html`;
  const baselineUrl = `${DIFF_ROUTE_PREFIX}/${nonce}/baseline.png`;
  const currentUrl = `${DIFF_ROUTE_PREFIX}/${nonce}/current.png`;
  const diffPage = await context.newPage();
  let blankRouted = false;
  let baselineRouted = false;
  let currentRouted = false;
  try {
    await diffPage.route(
      blankUrl,
      (route) => route.fulfill({ body: "<html><body></body></html>", contentType: "text/html" })
    );
    blankRouted = true;
    await diffPage.route(
      baselineUrl,
      (route) => route.fulfill({ body: baselineBuffer, contentType: baselineMime })
    );
    baselineRouted = true;
    await diffPage.route(
      currentUrl,
      (route) => route.fulfill({ body: currentBuffer, contentType: "image/png" })
    );
    currentRouted = true;
    await diffPage.goto(blankUrl);
    const pixelDiffFn = async (args) => {
      const g = globalThis;
      const doc = g.document;
      const Img = g.Image;
      function loadImage(url) {
        return new Promise((resolve2, reject) => {
          const img = new Img();
          img.onload = () => resolve2(img);
          img.onerror = () => reject(new Error("Failed to load image"));
          img.src = url;
        });
      }
      const [imgA, imgB] = await Promise.all([
        loadImage(args.baselineUrl),
        loadImage(args.currentUrl)
      ]);
      if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
        const c = doc.createElement("canvas");
        c.width = 1;
        c.height = 1;
        return {
          totalPixels: Math.max(imgA.width * imgA.height, imgB.width * imgB.height),
          differentPixels: Math.max(imgA.width * imgA.height, imgB.width * imgB.height),
          mismatchPercentage: 100,
          diffBase64: c.toDataURL("image/png").split(",")[1],
          dimensionMismatch: true
        };
      }
      const w = imgA.width;
      const h = imgA.height;
      const canvasA = doc.createElement("canvas");
      canvasA.width = w;
      canvasA.height = h;
      const ctxA = canvasA.getContext("2d");
      ctxA.drawImage(imgA, 0, 0);
      const dataA = ctxA.getImageData(0, 0, w, h).data;
      const canvasB = doc.createElement("canvas");
      canvasB.width = w;
      canvasB.height = h;
      const ctxB = canvasB.getContext("2d");
      ctxB.drawImage(imgB, 0, 0);
      const dataB = ctxB.getImageData(0, 0, w, h).data;
      const diffCanvas = doc.createElement("canvas");
      diffCanvas.width = w;
      diffCanvas.height = h;
      const ctxDiff = diffCanvas.getContext("2d");
      const diffImageData = ctxDiff.createImageData(w, h);
      const diffData = diffImageData.data;
      const maxColorDistance = args.threshold * 255 * Math.sqrt(3);
      let differentPixels = 0;
      const totalPixels = w * h;
      for (let i = 0; i < totalPixels; i++) {
        const offset = i * 4;
        const rA = dataA[offset], gA = dataA[offset + 1], bA = dataA[offset + 2];
        const rB = dataB[offset], gB = dataB[offset + 1], bB = dataB[offset + 2];
        const dr = rA - rB, dg = gA - gB, db = bA - bB;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);
        if (dist > maxColorDistance) {
          differentPixels++;
          diffData[offset] = 255;
          diffData[offset + 1] = 0;
          diffData[offset + 2] = 0;
          diffData[offset + 3] = 255;
        } else {
          diffData[offset] = Math.round(rA * 0.3);
          diffData[offset + 1] = Math.round(gA * 0.3);
          diffData[offset + 2] = Math.round(bA * 0.3);
          diffData[offset + 3] = 255;
        }
      }
      ctxDiff.putImageData(diffImageData, 0, 0);
      const diffBase64 = diffCanvas.toDataURL("image/png").split(",")[1];
      return {
        totalPixels,
        differentPixels,
        mismatchPercentage: Math.round(differentPixels / totalPixels * 1e4) / 100,
        diffBase64,
        dimensionMismatch: false
      };
    };
    const result = await diffPage.evaluate(pixelDiffFn, {
      baselineUrl,
      currentUrl,
      threshold
    });
    let outputPath = opts.outputPath;
    if (!outputPath) {
      const tmpDir = import_node_path5.default.join(
        process.env.HOME || process.env.USERPROFILE || "/tmp",
        ".agent-browser",
        "tmp",
        "diffs"
      );
      await (0, import_promises2.mkdir)(tmpDir, { recursive: true });
      outputPath = import_node_path5.default.join(tmpDir, `diff-${Date.now()}.png`);
    }
    const diffBuffer = Buffer.from(result.diffBase64, "base64");
    await (0, import_promises2.writeFile)(outputPath, diffBuffer);
    return {
      diffPath: outputPath,
      totalPixels: result.totalPixels,
      differentPixels: result.differentPixels,
      mismatchPercentage: result.mismatchPercentage,
      match: result.differentPixels === 0,
      ...result.dimensionMismatch ? { dimensionMismatch: true } : {}
    };
  } finally {
    if (blankRouted) await diffPage.unroute(blankUrl).catch(() => {
    });
    if (baselineRouted) await diffPage.unroute(baselineUrl).catch(() => {
    });
    if (currentRouted) await diffPage.unroute(currentUrl).catch(() => {
    });
    await diffPage.close().catch(() => {
    });
  }
}

// src/actions.ts
var screencastFrameCallback = null;
function setScreencastFrameCallback(callback) {
  screencastFrameCallback = callback;
}
function toAIFriendlyError(error, selector) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("strict mode violation")) {
    const countMatch = message.match(/resolved to (\d+) elements/);
    const count = countMatch ? countMatch[1] : "multiple";
    return new Error(
      `Selector "${selector}" matched ${count} elements. Run 'snapshot' to get updated refs, or use a more specific CSS selector.`
    );
  }
  if (message.includes("intercepts pointer events")) {
    return new Error(
      `Element "${selector}" is blocked by another element (likely a modal or overlay). Try dismissing any modals/cookie banners first.`
    );
  }
  if (message.includes("not visible") && !message.includes("Timeout")) {
    return new Error(
      `Element "${selector}" is not visible. Try scrolling it into view or check if it's hidden.`
    );
  }
  if (message.includes("Timeout") && message.includes("exceeded")) {
    return new Error(
      `Action on "${selector}" timed out. The element may be blocked, still loading, or not interactable. Run 'snapshot' to check the current page state.`
    );
  }
  if (message.includes("waiting for") && (message.includes("to be visible") || message.includes("Timeout"))) {
    return new Error(
      `Element "${selector}" not found or not visible. Run 'snapshot' to see current page elements.`
    );
  }
  return error instanceof Error ? error : new Error(message);
}
var actionPolicy = null;
var confirmCategories = /* @__PURE__ */ new Set();
function initActionPolicy() {
  const policyPath = process.env.AGENT_BROWSER_ACTION_POLICY;
  if (policyPath) {
    try {
      actionPolicy = loadPolicyFile(policyPath);
      initPolicyReloader(policyPath, actionPolicy);
    } catch (err) {
      console.error(
        `[ERROR] Failed to load action policy from ${policyPath}: ${err instanceof Error ? err.message : err}`
      );
      process.exit(1);
    }
  }
  const confirmActionsEnv = process.env.AGENT_BROWSER_CONFIRM_ACTIONS;
  if (confirmActionsEnv) {
    confirmCategories = new Set(
      confirmActionsEnv.split(",").map((c) => c.trim().toLowerCase()).filter((c) => c.length > 0)
    );
  }
}
async function executeCommand(command2, browser2) {
  try {
    if (command2.action === "confirm") {
      return await handleConfirm(command2, browser2);
    }
    if (command2.action === "deny") {
      return handleDeny(command2);
    }
    actionPolicy = reloadPolicyIfChanged();
    const decision = checkPolicy(command2.action, actionPolicy, confirmCategories);
    if (decision === "deny") {
      const category = getActionCategory(command2.action);
      return errorResponse(command2.id, `Action denied by policy: '${category}' is not allowed`);
    }
    if (decision === "confirm") {
      const category = getActionCategory(command2.action);
      const description = describeAction(
        command2.action,
        command2
      );
      const { confirmationId } = requestConfirmation(
        command2.action,
        category,
        description,
        command2
      );
      return successResponse(command2.id, {
        confirmation_required: true,
        action: command2.action,
        category,
        description,
        confirmation_id: confirmationId
      });
    }
    return await dispatchAction(command2, browser2);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(command2.id, message);
  }
}
async function dispatchAction(command2, browser2) {
  switch (command2.action) {
    case "launch":
      return await handleLaunch(command2, browser2);
    case "navigate":
      return await handleNavigate(command2, browser2);
    case "click":
      return await handleClick(command2, browser2);
    case "type":
      return await handleType(command2, browser2);
    case "fill":
      return await handleFill(command2, browser2);
    case "check":
      return await handleCheck(command2, browser2);
    case "uncheck":
      return await handleUncheck(command2, browser2);
    case "upload":
      return await handleUpload(command2, browser2);
    case "dblclick":
      return await handleDoubleClick(command2, browser2);
    case "focus":
      return await handleFocus(command2, browser2);
    case "drag":
      return await handleDrag(command2, browser2);
    case "frame":
      return await handleFrame(command2, browser2);
    case "mainframe":
      return await handleMainFrame(command2, browser2);
    case "getbyrole":
      return await handleGetByRole(command2, browser2);
    case "getbytext":
      return await handleGetByText(command2, browser2);
    case "getbylabel":
      return await handleGetByLabel(command2, browser2);
    case "getbyplaceholder":
      return await handleGetByPlaceholder(command2, browser2);
    case "press":
      return await handlePress(command2, browser2);
    case "screenshot":
      return await handleScreenshot(command2, browser2);
    case "snapshot":
      return await handleSnapshot(command2, browser2);
    case "evaluate":
      return await handleEvaluate(command2, browser2);
    case "wait":
      return await handleWait(command2, browser2);
    case "scroll":
      return await handleScroll(command2, browser2);
    case "select":
      return await handleSelect(command2, browser2);
    case "hover":
      return await handleHover(command2, browser2);
    case "content":
      return await handleContent(command2, browser2);
    case "close":
      return await handleClose(command2, browser2);
    case "tab_new":
      return await handleTabNew(command2, browser2);
    case "tab_list":
      return await handleTabList(command2, browser2);
    case "tab_switch":
      return await handleTabSwitch(command2, browser2);
    case "tab_close":
      return await handleTabClose(command2, browser2);
    case "window_new":
      return await handleWindowNew(command2, browser2);
    case "cookies_get":
      return await handleCookiesGet(command2, browser2);
    case "cookies_set":
      return await handleCookiesSet(command2, browser2);
    case "cookies_clear":
      return await handleCookiesClear(command2, browser2);
    case "storage_get":
      return await handleStorageGet(command2, browser2);
    case "storage_set":
      return await handleStorageSet(command2, browser2);
    case "storage_clear":
      return await handleStorageClear(command2, browser2);
    case "dialog":
      return await handleDialog(command2, browser2);
    case "pdf":
      return await handlePdf(command2, browser2);
    case "route":
      return await handleRoute(command2, browser2);
    case "unroute":
      return await handleUnroute(command2, browser2);
    case "requests":
      return await handleRequests(command2, browser2);
    case "download":
      return await handleDownload(command2, browser2);
    case "geolocation":
      return await handleGeolocation(command2, browser2);
    case "permissions":
      return await handlePermissions(command2, browser2);
    case "viewport":
      return await handleViewport(command2, browser2);
    case "useragent":
      return await handleUserAgent(command2, browser2);
    case "device":
      return await handleDevice(command2, browser2);
    case "back":
      return await handleBack(command2, browser2);
    case "forward":
      return await handleForward(command2, browser2);
    case "reload":
      return await handleReload(command2, browser2);
    case "url":
      return await handleUrl(command2, browser2);
    case "title":
      return await handleTitle(command2, browser2);
    case "getattribute":
      return await handleGetAttribute(command2, browser2);
    case "gettext":
      return await handleGetText(command2, browser2);
    case "isvisible":
      return await handleIsVisible(command2, browser2);
    case "isenabled":
      return await handleIsEnabled(command2, browser2);
    case "ischecked":
      return await handleIsChecked(command2, browser2);
    case "count":
      return await handleCount(command2, browser2);
    case "boundingbox":
      return await handleBoundingBox(command2, browser2);
    case "styles":
      return await handleStyles(command2, browser2);
    case "video_start":
      return await handleVideoStart(command2, browser2);
    case "video_stop":
      return await handleVideoStop(command2, browser2);
    case "trace_start":
      return await handleTraceStart(command2, browser2);
    case "trace_stop":
      return await handleTraceStop(command2, browser2);
    case "profiler_start":
      return await handleProfilerStart(command2, browser2);
    case "profiler_stop":
      return await handleProfilerStop(command2, browser2);
    case "har_start":
      return await handleHarStart(command2, browser2);
    case "har_stop":
      return await handleHarStop(command2, browser2);
    case "state_save":
      return await handleStateSave(command2, browser2);
    case "state_load":
      return await handleStateLoad(command2, browser2);
    case "state_list":
      return await handleStateList(command2);
    case "state_clear":
      return await handleStateClear(command2);
    case "state_show":
      return await handleStateShow(command2);
    case "state_clean":
      return await handleStateClean(command2);
    case "state_rename":
      return await handleStateRename(command2);
    case "console":
      return await handleConsole(command2, browser2);
    case "errors":
      return await handleErrors(command2, browser2);
    case "keyboard":
      return await handleKeyboard(command2, browser2);
    case "wheel":
      return await handleWheel(command2, browser2);
    case "tap":
      return await handleTap(command2, browser2);
    case "clipboard":
      return await handleClipboard(command2, browser2);
    case "highlight":
      return await handleHighlight(command2, browser2);
    case "clear":
      return await handleClear(command2, browser2);
    case "selectall":
      return await handleSelectAll(command2, browser2);
    case "innertext":
      return await handleInnerText(command2, browser2);
    case "innerhtml":
      return await handleInnerHtml(command2, browser2);
    case "inputvalue":
      return await handleInputValue(command2, browser2);
    case "setvalue":
      return await handleSetValue(command2, browser2);
    case "dispatch":
      return await handleDispatch(command2, browser2);
    case "evalhandle":
      return await handleEvalHandle(command2, browser2);
    case "expose":
      return await handleExpose(command2, browser2);
    case "addscript":
      return await handleAddScript(command2, browser2);
    case "addstyle":
      return await handleAddStyle(command2, browser2);
    case "emulatemedia":
      return await handleEmulateMedia(command2, browser2);
    case "offline":
      return await handleOffline(command2, browser2);
    case "headers":
      return await handleHeaders(command2, browser2);
    case "pause":
      return await handlePause(command2, browser2);
    case "getbyalttext":
      return await handleGetByAltText(command2, browser2);
    case "getbytitle":
      return await handleGetByTitle(command2, browser2);
    case "getbytestid":
      return await handleGetByTestId(command2, browser2);
    case "nth":
      return await handleNth(command2, browser2);
    case "waitforurl":
      return await handleWaitForUrl(command2, browser2);
    case "waitforloadstate":
      return await handleWaitForLoadState(command2, browser2);
    case "setcontent":
      return await handleSetContent(command2, browser2);
    case "timezone":
      return await handleTimezone(command2, browser2);
    case "locale":
      return await handleLocale(command2, browser2);
    case "credentials":
      return await handleCredentials(command2, browser2);
    case "mousemove":
      return await handleMouseMove(command2, browser2);
    case "mousedown":
      return await handleMouseDown(command2, browser2);
    case "mouseup":
      return await handleMouseUp(command2, browser2);
    case "bringtofront":
      return await handleBringToFront(command2, browser2);
    case "waitforfunction":
      return await handleWaitForFunction(command2, browser2);
    case "scrollintoview":
      return await handleScrollIntoView(command2, browser2);
    case "addinitscript":
      return await handleAddInitScript(command2, browser2);
    case "keydown":
      return await handleKeyDown(command2, browser2);
    case "keyup":
      return await handleKeyUp(command2, browser2);
    case "inserttext":
      return await handleInsertText(command2, browser2);
    case "multiselect":
      return await handleMultiSelect(command2, browser2);
    case "waitfordownload":
      return await handleWaitForDownload(command2, browser2);
    case "responsebody":
      return await handleResponseBody(command2, browser2);
    case "screencast_start":
      return await handleScreencastStart(command2, browser2);
    case "screencast_stop":
      return await handleScreencastStop(command2, browser2);
    case "input_mouse":
      return await handleInputMouse(command2, browser2);
    case "input_keyboard":
      return await handleInputKeyboard(command2, browser2);
    case "input_touch":
      return await handleInputTouch(command2, browser2);
    case "recording_start":
      return await handleRecordingStart(command2, browser2);
    case "recording_stop":
      return await handleRecordingStop(command2, browser2);
    case "recording_restart":
      return await handleRecordingRestart(command2, browser2);
    case "diff_snapshot":
      return await handleDiffSnapshot(command2, browser2);
    case "diff_screenshot":
      return await handleDiffScreenshot(command2, browser2);
    case "diff_url":
      return await handleDiffUrl(command2, browser2);
    case "auth_login":
      return await handleAuthLogin(command2, browser2);
    default: {
      const unknownCommand = command2;
      return errorResponse(unknownCommand.id, `Unknown action: ${unknownCommand.action}`);
    }
  }
}
async function handleLaunch(command2, browser2) {
  if (command2.engine === "lightpanda") {
    return errorResponse(command2.id, "Lightpanda engine requires --native mode");
  }
  await browser2.launch(command2);
  return successResponse(command2.id, { launched: true });
}
async function handleNavigate(command2, browser2) {
  browser2.checkDomainAllowed(command2.url);
  const page2 = browser2.getPage();
  if (command2.headers && Object.keys(command2.headers).length > 0) {
    await browser2.setScopedHeaders(command2.url, command2.headers);
  }
  await page2.goto(command2.url, {
    waitUntil: command2.waitUntil ?? "domcontentloaded"
  });
  return successResponse(command2.id, {
    url: page2.url(),
    title: await page2.title()
  });
}
async function handleClick(command2, browser2) {
  const locator2 = browser2.getLocator(command2.selector);
  try {
    if (command2.newTab) {
      const fullUrl = await locator2.evaluate((el2) => {
        const href = el2.getAttribute("href");
        return href ? new globalThis.URL(href, globalThis.document.baseURI).toString() : "";
      });
      if (!fullUrl) {
        throw new Error(
          `Element '${command2.selector}' does not have an href attribute. --new-tab only works on links.`
        );
      }
      await browser2.newTab();
      const newPage = browser2.getPage();
      await newPage.goto(fullUrl);
      return successResponse(command2.id, {
        clicked: true,
        newTab: true,
        url: fullUrl
      });
    }
    await locator2.click({
      button: command2.button,
      clickCount: command2.clickCount,
      delay: command2.delay
    });
  } catch (error) {
    throw toAIFriendlyError(error, command2.selector);
  }
  return successResponse(command2.id, { clicked: true });
}
async function handleType(command2, browser2) {
  const locator2 = browser2.getLocator(command2.selector);
  try {
    if (command2.clear) {
      await locator2.fill("");
    }
    await locator2.pressSequentially(command2.text, {
      delay: command2.delay
    });
  } catch (error) {
    throw toAIFriendlyError(error, command2.selector);
  }
  return successResponse(command2.id, { typed: true });
}
async function handlePress(command2, browser2) {
  const page2 = browser2.getPage();
  if (command2.selector) {
    await page2.press(command2.selector, command2.key);
  } else {
    await page2.keyboard.press(command2.key);
  }
  return successResponse(command2.id, { pressed: true });
}
var ANNOTATION_OVERLAY_ID = "__agent_browser_annotations__";
async function removeAnnotationOverlay(page2) {
  await page2.evaluate(
    `(() => { const el = document.getElementById(${JSON.stringify(ANNOTATION_OVERLAY_ID)}); if (el) el.remove(); })()`
  ).catch(() => {
  });
}
async function handleScreenshot(command2, browser2) {
  const page2 = browser2.getPage();
  const options = {
    fullPage: command2.fullPage,
    type: command2.format ?? "png"
  };
  if (command2.format === "jpeg" && command2.quality !== void 0) {
    options.quality = command2.quality;
  }
  let target = page2;
  if (command2.selector) {
    target = browser2.getLocator(command2.selector);
  }
  let overlayInjected = false;
  try {
    let savePath = command2.path;
    if (!savePath) {
      const ext = command2.format === "jpeg" ? "jpg" : "png";
      const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
      const random = Math.random().toString(36).substring(2, 8);
      const filename = `screenshot-${timestamp}-${random}.${ext}`;
      const screenshotDir = path5.join(getAppDir(), "tmp", "screenshots");
      (0, import_node_fs5.mkdirSync)(screenshotDir, { recursive: true });
      savePath = path5.join(screenshotDir, filename);
    }
    let annotations;
    if (command2.annotate) {
      const { refs } = await browser2.getSnapshot({ interactive: true });
      const entries = Object.entries(refs);
      const results = await Promise.all(
        entries.map(async ([ref, data]) => {
          try {
            const locator2 = browser2.getLocatorFromRef(ref);
            if (!locator2) return null;
            const box = await locator2.boundingBox();
            if (!box || box.width === 0 || box.height === 0) return null;
            const num = parseInt(ref.replace("e", ""), 10);
            return {
              ref,
              number: num,
              role: data.role,
              name: data.name || void 0,
              box: {
                x: Math.round(box.x),
                y: Math.round(box.y),
                width: Math.round(box.width),
                height: Math.round(box.height)
              }
            };
          } catch {
            return null;
          }
        })
      );
      let targetBox = null;
      if (command2.selector) {
        const raw = await browser2.getLocator(command2.selector).boundingBox();
        if (raw) {
          targetBox = {
            x: Math.round(raw.x),
            y: Math.round(raw.y),
            width: Math.round(raw.width),
            height: Math.round(raw.height)
          };
        }
      }
      const filtered = results.filter((a) => a !== null);
      let overlayItems;
      if (targetBox) {
        const tb = targetBox;
        overlayItems = filtered.filter((a) => {
          const ax2 = a.box.x + a.box.width;
          const ay2 = a.box.y + a.box.height;
          const bx2 = tb.x + tb.width;
          const by2 = tb.y + tb.height;
          return a.box.x < bx2 && ax2 > tb.x && a.box.y < by2 && ay2 > tb.y;
        }).sort((a, b) => a.number - b.number);
      } else {
        overlayItems = filtered.sort((a, b) => a.number - b.number);
      }
      if (overlayItems.length > 0) {
        const overlayData = overlayItems.map((a) => ({
          number: a.number,
          x: a.box.x,
          y: a.box.y,
          width: a.box.width,
          height: a.box.height
        }));
        await page2.evaluate(`(() => {
          var items = ${JSON.stringify(overlayData)};
          var id = ${JSON.stringify(ANNOTATION_OVERLAY_ID)};
          var sx = window.scrollX || 0;
          var sy = window.scrollY || 0;
          var c = document.createElement('div');
          c.id = id;
          c.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;pointer-events:none;z-index:2147483647;';
          for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var dx = it.x + sx;
            var dy = it.y + sy;
            var b = document.createElement('div');
            b.style.cssText = 'position:absolute;left:' + dx + 'px;top:' + dy + 'px;width:' + it.width + 'px;height:' + it.height + 'px;border:2px solid rgba(255,0,0,0.8);box-sizing:border-box;pointer-events:none;';
            var l = document.createElement('div');
            l.textContent = String(it.number);
            var labelTop = dy < 14 ? '2px' : '-14px';
            l.style.cssText = 'position:absolute;top:' + labelTop + ';left:-2px;background:rgba(255,0,0,0.9);color:#fff;font:bold 11px/14px monospace;padding:0 4px;border-radius:2px;white-space:nowrap;';
            b.appendChild(l);
            c.appendChild(b);
          }
          document.documentElement.appendChild(c);
        })()`);
        overlayInjected = true;
      }
      if (targetBox) {
        const tb = targetBox;
        annotations = overlayItems.map((a) => ({
          ...a,
          box: {
            x: a.box.x - tb.x,
            y: a.box.y - tb.y,
            width: a.box.width,
            height: a.box.height
          }
        }));
      } else if (command2.fullPage) {
        const scroll = await page2.evaluate(
          `({x: window.scrollX || 0, y: window.scrollY || 0})`
        );
        annotations = overlayItems.map((a) => ({
          ...a,
          box: {
            x: a.box.x + scroll.x,
            y: a.box.y + scroll.y,
            width: a.box.width,
            height: a.box.height
          }
        }));
      } else {
        annotations = overlayItems;
      }
    }
    await target.screenshot({ ...options, path: savePath });
    if (overlayInjected) {
      await removeAnnotationOverlay(page2);
    }
    return successResponse(command2.id, {
      path: savePath,
      ...annotations && annotations.length > 0 ? { annotations } : {}
    });
  } catch (error) {
    if (overlayInjected) {
      await removeAnnotationOverlay(page2);
    }
    if (command2.selector) {
      throw toAIFriendlyError(error, command2.selector);
    }
    throw error;
  }
}
async function handleSnapshot(command2, browser2) {
  const { tree, refs } = await browser2.getSnapshot({
    interactive: command2.interactive,
    cursor: command2.cursor ?? true,
    maxDepth: command2.maxDepth,
    compact: command2.compact,
    selector: command2.selector
  });
  const simpleRefs = {};
  for (const [ref, data] of Object.entries(refs)) {
    simpleRefs[ref] = { role: data.role, name: data.name };
  }
  const page2 = browser2.getPage();
  return successResponse(command2.id, {
    snapshot: tree || "Empty page",
    refs: Object.keys(simpleRefs).length > 0 ? simpleRefs : void 0,
    origin: page2.url()
  });
}
async function handleEvaluate(command2, browser2) {
  const page2 = browser2.getPage();
  const result = await page2.evaluate(command2.script);
  return successResponse(command2.id, { result, origin: page2.url() });
}
async function handleWait(command2, browser2) {
  const page2 = browser2.getPage();
  if (command2.selector) {
    await page2.waitForSelector(command2.selector, {
      state: command2.state ?? "visible",
      timeout: command2.timeout
    });
  } else if (command2.timeout) {
    await page2.waitForTimeout(command2.timeout);
  } else {
    await page2.waitForLoadState("load");
  }
  return successResponse(command2.id, { waited: true });
}
async function handleScroll(command2, browser2) {
  const page2 = browser2.getPage();
  let deltaX = command2.x ?? 0;
  let deltaY = command2.y ?? 0;
  const hasExplicitDelta = command2.x !== void 0 || command2.y !== void 0;
  if (command2.direction) {
    const amount = command2.amount ?? 100;
    switch (command2.direction) {
      case "up":
        deltaY = -amount;
        break;
      case "down":
        deltaY = amount;
        break;
      case "left":
        deltaX = -amount;
        break;
      case "right":
        deltaX = amount;
        break;
    }
  }
  if (command2.selector) {
    const element2 = browser2.getLocator(command2.selector);
    await element2.scrollIntoViewIfNeeded();
    if (hasExplicitDelta || deltaX !== 0 || deltaY !== 0) {
      await element2.evaluate(
        (el2, { x, y }) => {
          el2.scrollBy(x, y);
        },
        { x: deltaX, y: deltaY }
      );
    }
  } else {
    await page2.evaluate(`window.scrollBy(${deltaX}, ${deltaY})`);
  }
  return successResponse(command2.id, { scrolled: true });
}
async function handleSelect(command2, browser2) {
  const locator2 = browser2.getLocator(command2.selector);
  const values = Array.isArray(command2.values) ? command2.values : [command2.values];
  try {
    await locator2.selectOption(values);
  } catch (error) {
    throw toAIFriendlyError(error, command2.selector);
  }
  return successResponse(command2.id, { selected: values });
}
async function handleHover(command2, browser2) {
  const locator2 = browser2.getLocator(command2.selector);
  try {
    await locator2.hover();
  } catch (error) {
    throw toAIFriendlyError(error, command2.selector);
  }
  return successResponse(command2.id, { hovered: true });
}
async function handleContent(command2, browser2) {
  const page2 = browser2.getPage();
  let html;
  if (command2.selector) {
    html = await page2.locator(command2.selector).innerHTML();
  } else {
    html = await page2.content();
  }
  return successResponse(command2.id, { html, origin: page2.url() });
}
async function handleClose(command2, browser2) {
  await browser2.close();
  return successResponse(command2.id, { closed: true });
}
async function handleTabNew(command2, browser2) {
  const result = await browser2.newTab();
  if (command2.url) {
    const page2 = browser2.getPage();
    await page2.goto(command2.url, { waitUntil: "domcontentloaded" });
  }
  return successResponse(command2.id, result);
}
async function handleTabList(command2, browser2) {
  const tabs = await browser2.listTabs();
  return successResponse(command2.id, {
    tabs,
    active: browser2.getActiveIndex()
  });
}
async function handleTabSwitch(command2, browser2) {
  const result = await browser2.switchTo(command2.index);
  const page2 = browser2.getPage();
  return successResponse(command2.id, {
    ...result,
    title: await page2.title()
  });
}
async function handleTabClose(command2, browser2) {
  const result = await browser2.closeTab(command2.index);
  return successResponse(command2.id, result);
}
async function handleWindowNew(command2, browser2) {
  const result = await browser2.newWindow(command2.viewport);
  return successResponse(command2.id, result);
}
async function handleFill(command2, browser2) {
  const locator2 = browser2.getLocator(command2.selector);
  try {
    await locator2.fill(command2.value);
  } catch (error) {
    throw toAIFriendlyError(error, command2.selector);
  }
  return successResponse(command2.id, { filled: true });
}
async function handleCheck(command2, browser2) {
  const locator2 = browser2.getLocator(command2.selector);
  try {
    await locator2.check();
  } catch (error) {
    throw toAIFriendlyError(error, command2.selector);
  }
  return successResponse(command2.id, { checked: true });
}
async function handleUncheck(command2, browser2) {
  const locator2 = browser2.getLocator(command2.selector);
  try {
    await locator2.uncheck();
  } catch (error) {
    throw toAIFriendlyError(error, command2.selector);
  }
  return successResponse(command2.id, { unchecked: true });
}
async function handleUpload(command2, browser2) {
  const locator2 = browser2.getLocator(command2.selector);
  const files = Array.isArray(command2.files) ? command2.files : [command2.files];
  try {
    await locator2.setInputFiles(files);
  } catch (error) {
    throw toAIFriendlyError(error, command2.selector);
  }
  return successResponse(command2.id, { uploaded: files });
}
async function handleDoubleClick(command2, browser2) {
  const locator2 = browser2.getLocator(command2.selector);
  try {
    await locator2.dblclick();
  } catch (error) {
    throw toAIFriendlyError(error, command2.selector);
  }
  return successResponse(command2.id, { clicked: true });
}
async function handleFocus(command2, browser2) {
  const locator2 = browser2.getLocator(command2.selector);
  try {
    await locator2.focus();
  } catch (error) {
    throw toAIFriendlyError(error, command2.selector);
  }
  return successResponse(command2.id, { focused: true });
}
async function handleDrag(command2, browser2) {
  const frame = browser2.getFrame();
  await frame.dragAndDrop(command2.source, command2.target);
  return successResponse(command2.id, { dragged: true });
}
async function handleFrame(command2, browser2) {
  await browser2.switchToFrame({
    selector: command2.selector,
    name: command2.name,
    url: command2.url
  });
  return successResponse(command2.id, { switched: true });
}
async function handleMainFrame(command2, browser2) {
  browser2.switchToMainFrame();
  return successResponse(command2.id, { switched: true });
}
async function handleGetByRole(command2, browser2) {
  const page2 = browser2.getPage();
  const locator2 = page2.getByRole(command2.role, { name: command2.name, exact: command2.exact });
  switch (command2.subaction) {
    case "click":
      await locator2.click();
      return successResponse(command2.id, { clicked: true });
    case "fill":
      await locator2.fill(command2.value ?? "");
      return successResponse(command2.id, { filled: true });
    case "check":
      await locator2.check();
      return successResponse(command2.id, { checked: true });
    case "hover":
      await locator2.hover();
      return successResponse(command2.id, { hovered: true });
  }
}
async function handleGetByText(command2, browser2) {
  const page2 = browser2.getPage();
  const locator2 = page2.getByText(command2.text, { exact: command2.exact });
  switch (command2.subaction) {
    case "click":
      await locator2.click();
      return successResponse(command2.id, { clicked: true });
    case "hover":
      await locator2.hover();
      return successResponse(command2.id, { hovered: true });
  }
}
async function handleGetByLabel(command2, browser2) {
  const page2 = browser2.getPage();
  const locator2 = page2.getByLabel(command2.label, { exact: command2.exact });
  switch (command2.subaction) {
    case "click":
      await locator2.click();
      return successResponse(command2.id, { clicked: true });
    case "fill":
      await locator2.fill(command2.value ?? "");
      return successResponse(command2.id, { filled: true });
    case "check":
      await locator2.check();
      return successResponse(command2.id, { checked: true });
  }
}
async function handleGetByPlaceholder(command2, browser2) {
  const page2 = browser2.getPage();
  const locator2 = page2.getByPlaceholder(command2.placeholder, { exact: command2.exact });
  switch (command2.subaction) {
    case "click":
      await locator2.click();
      return successResponse(command2.id, { clicked: true });
    case "fill":
      await locator2.fill(command2.value ?? "");
      return successResponse(command2.id, { filled: true });
  }
}
async function handleCookiesGet(command2, browser2) {
  const page2 = browser2.getPage();
  const context = page2.context();
  const cookies = await context.cookies(command2.urls);
  return successResponse(command2.id, { cookies });
}
async function handleCookiesSet(command2, browser2) {
  const page2 = browser2.getPage();
  const context = page2.context();
  const pageUrl = page2.url();
  const cookies = command2.cookies.map((cookie) => {
    if (!cookie.url && !cookie.domain && !cookie.path) {
      return { ...cookie, url: pageUrl };
    }
    return cookie;
  });
  await context.addCookies(cookies);
  return successResponse(command2.id, { set: true });
}
async function handleCookiesClear(command2, browser2) {
  const page2 = browser2.getPage();
  const context = page2.context();
  await context.clearCookies();
  return successResponse(command2.id, { cleared: true });
}
async function handleStorageGet(command2, browser2) {
  const page2 = browser2.getPage();
  const storageType = command2.type === "local" ? "localStorage" : "sessionStorage";
  if (command2.key) {
    const value = await page2.evaluate(`${storageType}.getItem(${JSON.stringify(command2.key)})`);
    return successResponse(command2.id, { key: command2.key, value });
  } else {
    const data = await page2.evaluate(`
      (() => {
        const storage = ${storageType};
        const result = {};
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key) result[key] = storage.getItem(key);
        }
        return result;
      })()
    `);
    return successResponse(command2.id, { data });
  }
}
async function handleStorageSet(command2, browser2) {
  const page2 = browser2.getPage();
  const storageType = command2.type === "local" ? "localStorage" : "sessionStorage";
  await page2.evaluate(
    `${storageType}.setItem(${JSON.stringify(command2.key)}, ${JSON.stringify(command2.value)})`
  );
  return successResponse(command2.id, { set: true });
}
async function handleStorageClear(command2, browser2) {
  const page2 = browser2.getPage();
  const storageType = command2.type === "local" ? "localStorage" : "sessionStorage";
  await page2.evaluate(`${storageType}.clear()`);
  return successResponse(command2.id, { cleared: true });
}
async function handleDialog(command2, browser2) {
  browser2.setDialogHandler(command2.response, command2.promptText);
  return successResponse(command2.id, { handler: "set", response: command2.response });
}
async function handlePdf(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.pdf({
    path: command2.path,
    format: command2.format ?? "Letter"
  });
  return successResponse(command2.id, { path: command2.path });
}
async function handleRoute(command2, browser2) {
  await browser2.addRoute(command2.url, {
    response: command2.response,
    abort: command2.abort
  });
  return successResponse(command2.id, { routed: command2.url });
}
async function handleUnroute(command2, browser2) {
  await browser2.removeRoute(command2.url);
  return successResponse(command2.id, { unrouted: command2.url ?? "all" });
}
async function handleRequests(command2, browser2) {
  if (command2.clear) {
    browser2.clearRequests();
    return successResponse(command2.id, { cleared: true });
  }
  browser2.startRequestTracking();
  const requests = browser2.getRequests(command2.filter);
  return successResponse(command2.id, { requests });
}
async function handleDownload(command2, browser2) {
  const page2 = browser2.getPage();
  const locator2 = browser2.getLocator(command2.selector);
  const [download] = await Promise.all([page2.waitForEvent("download"), locator2.click()]);
  await download.saveAs(command2.path);
  return successResponse(command2.id, {
    path: command2.path,
    suggestedFilename: download.suggestedFilename()
  });
}
async function handleGeolocation(command2, browser2) {
  await browser2.setGeolocation(command2.latitude, command2.longitude, command2.accuracy);
  return successResponse(command2.id, {
    latitude: command2.latitude,
    longitude: command2.longitude
  });
}
async function handlePermissions(command2, browser2) {
  await browser2.setPermissions(command2.permissions, command2.grant);
  return successResponse(command2.id, {
    permissions: command2.permissions,
    granted: command2.grant
  });
}
async function handleViewport(command2, browser2) {
  if (command2.deviceScaleFactor && command2.deviceScaleFactor !== 1) {
    await browser2.setViewport(command2.width, command2.height);
    await browser2.setDeviceScaleFactor(
      command2.deviceScaleFactor,
      command2.width,
      command2.height,
      false
    );
  } else {
    try {
      await browser2.clearDeviceMetricsOverride();
    } catch {
    }
    await browser2.setViewport(command2.width, command2.height);
  }
  const result = {
    width: command2.width,
    height: command2.height
  };
  if (command2.deviceScaleFactor !== void 0) {
    result.deviceScaleFactor = command2.deviceScaleFactor;
  }
  return successResponse(command2.id, result);
}
async function handleUserAgent(command2, browser2) {
  const page2 = browser2.getPage();
  const context = page2.context();
  return successResponse(command2.id, {
    note: "User agent can only be set at launch time. Use device command instead."
  });
}
async function handleDevice(command2, browser2) {
  const device = browser2.getDevice(command2.device);
  if (!device) {
    const available = browser2.listDevices().slice(0, 10).join(", ");
    throw new Error(`Unknown device: ${command2.device}. Available: ${available}...`);
  }
  await browser2.setViewport(device.viewport.width, device.viewport.height);
  if (device.deviceScaleFactor && device.deviceScaleFactor !== 1) {
    await browser2.setDeviceScaleFactor(
      device.deviceScaleFactor,
      device.viewport.width,
      device.viewport.height,
      device.isMobile ?? false
    );
  } else {
    try {
      await browser2.clearDeviceMetricsOverride();
    } catch {
    }
  }
  return successResponse(command2.id, {
    device: command2.device,
    viewport: device.viewport,
    userAgent: device.userAgent,
    deviceScaleFactor: device.deviceScaleFactor
  });
}
async function handleBack(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.goBack();
  return successResponse(command2.id, { url: page2.url() });
}
async function handleForward(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.goForward();
  return successResponse(command2.id, { url: page2.url() });
}
async function handleReload(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.reload();
  return successResponse(command2.id, { url: page2.url() });
}
async function handleUrl(command2, browser2) {
  const page2 = browser2.getPage();
  return successResponse(command2.id, { url: page2.url() });
}
async function handleTitle(command2, browser2) {
  const page2 = browser2.getPage();
  const title = await page2.title();
  return successResponse(command2.id, { title });
}
async function handleGetAttribute(command2, browser2) {
  const page2 = browser2.getPage();
  const locator2 = browser2.getLocator(command2.selector);
  const value = await locator2.getAttribute(command2.attribute);
  return successResponse(command2.id, { attribute: command2.attribute, value, origin: page2.url() });
}
async function handleGetText(command2, browser2) {
  const page2 = browser2.getPage();
  const locator2 = browser2.getLocator(command2.selector);
  const text = await locator2.textContent();
  return successResponse(command2.id, { text, origin: page2.url() });
}
async function handleIsVisible(command2, browser2) {
  const locator2 = browser2.getLocator(command2.selector);
  const visible = await locator2.isVisible();
  return successResponse(command2.id, { visible });
}
async function handleIsEnabled(command2, browser2) {
  const locator2 = browser2.getLocator(command2.selector);
  const enabled = await locator2.isEnabled();
  return successResponse(command2.id, { enabled });
}
async function handleIsChecked(command2, browser2) {
  const locator2 = browser2.getLocator(command2.selector);
  const checked = await locator2.isChecked();
  return successResponse(command2.id, { checked });
}
async function handleCount(command2, browser2) {
  const page2 = browser2.getPage();
  const count = await page2.locator(command2.selector).count();
  return successResponse(command2.id, { count });
}
async function handleBoundingBox(command2, browser2) {
  const page2 = browser2.getPage();
  const box = await page2.locator(command2.selector).boundingBox();
  return successResponse(command2.id, { box });
}
async function handleStyles(command, browser) {
  const page = browser.getPage();
  const extractStylesScript = `(function(el) {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      text: el.innerText?.trim().slice(0, 80) || null,
      box: {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
      },
      styles: {
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        fontFamily: s.fontFamily.split(',')[0].trim().replace(/"/g, ''),
        color: s.color,
        backgroundColor: s.backgroundColor,
        borderRadius: s.borderRadius,
        border: s.border !== 'none' && s.borderWidth !== '0px' ? s.border : null,
        boxShadow: s.boxShadow !== 'none' ? s.boxShadow : null,
        padding: s.padding,
      },
    };
  })`;
  if (browser.isRef(command.selector)) {
    const locator = browser.getLocator(command.selector);
    const element = await locator.evaluate((el, script) => {
      const fn = eval(script);
      return fn(el);
    }, extractStylesScript);
    return successResponse(command.id, { elements: [element] });
  }
  const elements = await page.$$eval(
    command.selector,
    (els, script) => {
      const fn = eval(script);
      return els.map((el2) => fn(el2));
    },
    extractStylesScript
  );
  return successResponse(command.id, { elements });
}
async function handleVideoStart(command2, browser2) {
  return successResponse(command2.id, {
    note: "Video recording must be enabled at browser launch. Use --video flag when starting.",
    path: command2.path
  });
}
async function handleVideoStop(command2, browser2) {
  const page2 = browser2.getPage();
  const video = page2.video();
  if (video) {
    const path7 = await video.path();
    return successResponse(command2.id, { path: path7 });
  }
  return successResponse(command2.id, { note: "No video recording active" });
}
async function handleTraceStart(command2, browser2) {
  await browser2.startTracing({
    screenshots: command2.screenshots,
    snapshots: command2.snapshots
  });
  return successResponse(command2.id, { started: true });
}
async function handleTraceStop(command2, browser2) {
  await browser2.stopTracing(command2.path);
  return successResponse(
    command2.id,
    command2.path ? { path: command2.path } : { traceStopped: true }
  );
}
async function handleProfilerStart(command2, browser2) {
  await browser2.startProfiling({ categories: command2.categories });
  return successResponse(command2.id, { started: true });
}
async function handleProfilerStop(command2, browser2) {
  let outputPath = command2.path;
  if (!outputPath) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const random = Math.random().toString(36).substring(2, 8);
    const filename = `profile-${timestamp}-${random}.json`;
    const profileDir = path5.join(getAppDir(), "tmp", "profiles");
    (0, import_node_fs5.mkdirSync)(profileDir, { recursive: true });
    outputPath = path5.join(profileDir, filename);
  }
  const result = await browser2.stopProfiling(outputPath);
  return successResponse(command2.id, result);
}
async function handleHarStart(command2, browser2) {
  await browser2.startHarRecording();
  browser2.startRequestTracking();
  return successResponse(command2.id, { started: true });
}
async function handleHarStop(command2, browser2) {
  const requests = browser2.getRequests();
  return successResponse(command2.id, {
    path: command2.path,
    requestCount: requests.length
  });
}
async function handleStateSave(command2, browser2) {
  await browser2.saveStorageState(command2.path);
  return successResponse(command2.id, { path: command2.path });
}
async function handleStateLoad(command2, browser2) {
  if (browser2.isLaunched()) {
    return errorResponse(
      command2.id,
      "Cannot load state while browser is running. Close browser first, then relaunch with loaded state."
    );
  }
  if (!fs2.existsSync(command2.path)) {
    return errorResponse(command2.id, `State file not found: ${command2.path}`);
  }
  await browser2.launch({
    id: command2.id,
    action: "launch",
    headless: true,
    autoStateFilePath: command2.path
  });
  return successResponse(command2.id, {
    loaded: true,
    path: command2.path
  });
}
async function handleStateList(command2) {
  const sessionsDir = getSessionsDir();
  const files = listStateFiles();
  if (files.length === 0) {
    return successResponse(command2.id, { files: [], directory: sessionsDir });
  }
  const stateFiles = files.map((filename) => {
    const filepath = path5.join(sessionsDir, filename);
    const stats = fs2.statSync(filepath);
    let encrypted = false;
    try {
      const content = fs2.readFileSync(filepath, "utf-8");
      const parsed = JSON.parse(content);
      encrypted = isEncryptedPayload(parsed);
    } catch {
    }
    return {
      filename,
      path: filepath,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      encrypted
    };
  }).sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
  return successResponse(command2.id, { files: stateFiles, directory: sessionsDir });
}
async function handleStateClear(command2) {
  const sessionsDir = getSessionsDir();
  if (command2.sessionName && !isValidSessionName(command2.sessionName)) {
    return errorResponse(
      command2.id,
      "Invalid session name. Use only letters, numbers, dashes, and underscores."
    );
  }
  const files = listStateFiles();
  if (files.length === 0) {
    return successResponse(command2.id, { cleared: 0, deleted: [] });
  }
  const deleted = [];
  if (command2.all) {
    for (const file of files) {
      fs2.unlinkSync(path5.join(sessionsDir, file));
      deleted.push(file);
    }
  } else if (command2.sessionName) {
    for (const file of files) {
      if (file.startsWith(`${command2.sessionName}-`)) {
        fs2.unlinkSync(path5.join(sessionsDir, file));
        deleted.push(file);
      }
    }
  }
  return successResponse(command2.id, { cleared: deleted.length, deleted });
}
async function handleStateShow(command2) {
  const sessionsDir = getSessionsDir();
  const baseName = command2.filename.replace(/\.json$/, "");
  if (!command2.filename.endsWith(".json") || !isValidSessionName(baseName)) {
    return errorResponse(
      command2.id,
      "Invalid filename. Use only letters, numbers, dashes, and underscores (with .json extension)."
    );
  }
  const filepath = path5.join(sessionsDir, command2.filename);
  if (!fs2.existsSync(filepath)) {
    return errorResponse(command2.id, `State file not found: ${command2.filename}`);
  }
  try {
    const { data: state, wasEncrypted } = readStateFile(filepath);
    const stats = fs2.statSync(filepath);
    const stateObj = state;
    const cookies = stateObj.cookies?.length || 0;
    const origins = stateObj.origins?.length || 0;
    const domains = [...new Set((stateObj.cookies || []).map((c) => c.domain))];
    return successResponse(command2.id, {
      filename: command2.filename,
      path: filepath,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      encrypted: wasEncrypted,
      summary: {
        cookies,
        origins,
        domains
      },
      state
    });
  } catch (e) {
    return errorResponse(command2.id, `Failed to parse state file: ${e.message}`);
  }
}
async function handleStateClean(command2) {
  const deleted = cleanupExpiredStates(command2.days);
  const keptCount = listStateFiles().length;
  return successResponse(command2.id, {
    cleaned: deleted.length,
    deleted,
    keptCount,
    days: command2.days
  });
}
async function handleStateRename(command2) {
  const sessionsDir = getSessionsDir();
  if (!isValidSessionName(command2.oldName) || !isValidSessionName(command2.newName)) {
    return errorResponse(
      command2.id,
      "Invalid name. Use only letters, numbers, dashes, and underscores."
    );
  }
  const oldPath = path5.join(sessionsDir, `${command2.oldName}.json`);
  const newPath = path5.join(sessionsDir, `${command2.newName}.json`);
  if (!fs2.existsSync(oldPath)) {
    return errorResponse(command2.id, `State file not found: ${command2.oldName}.json`);
  }
  if (fs2.existsSync(newPath)) {
    return errorResponse(command2.id, `Destination already exists: ${command2.newName}.json`);
  }
  fs2.renameSync(oldPath, newPath);
  return successResponse(command2.id, {
    renamed: true,
    oldName: `${command2.oldName}.json`,
    newName: `${command2.newName}.json`,
    path: newPath
  });
}
async function handleConsole(command2, browser2) {
  if (command2.clear) {
    browser2.clearConsoleMessages();
    return successResponse(command2.id, { cleared: true });
  }
  const page2 = browser2.getPage();
  const messages = browser2.getConsoleMessages();
  return successResponse(command2.id, { messages, origin: page2.url() });
}
async function handleErrors(command2, browser2) {
  if (command2.clear) {
    browser2.clearPageErrors();
    return successResponse(command2.id, { cleared: true });
  }
  const errors = browser2.getPageErrors();
  return successResponse(command2.id, { errors });
}
async function handleKeyboard(command2, browser2) {
  const page2 = browser2.getPage();
  const sub = command2.subaction ?? "press";
  switch (sub) {
    case "type":
      await page2.keyboard.type(command2.text ?? "", { delay: command2.delay });
      return successResponse(command2.id, { typed: true, text: command2.text });
    case "press":
      await page2.keyboard.press(command2.keys ?? "");
      return successResponse(command2.id, { pressed: command2.keys });
    case "insertText":
      await page2.keyboard.insertText(command2.text ?? "");
      return successResponse(command2.id, { inserted: true, text: command2.text });
    default:
      return errorResponse(command2.id, `Unknown keyboard subaction: ${sub}`);
  }
}
async function handleWheel(command2, browser2) {
  const page2 = browser2.getPage();
  if (command2.selector) {
    const element2 = page2.locator(command2.selector);
    await element2.hover();
  }
  await page2.mouse.wheel(command2.deltaX ?? 0, command2.deltaY ?? 0);
  return successResponse(command2.id, { scrolled: true });
}
async function handleTap(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.tap(command2.selector);
  return successResponse(command2.id, { tapped: true });
}
async function handleClipboard(command2, browser2) {
  const page2 = browser2.getPage();
  switch (command2.operation) {
    case "copy":
      await page2.keyboard.press("Control+c");
      return successResponse(command2.id, { copied: true });
    case "paste":
      await page2.keyboard.press("Control+v");
      return successResponse(command2.id, { pasted: true });
    case "read":
      const text = await page2.evaluate("navigator.clipboard.readText()");
      return successResponse(command2.id, { text });
    default:
      return errorResponse(command2.id, "Unknown clipboard operation");
  }
}
async function handleHighlight(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.locator(command2.selector).highlight();
  return successResponse(command2.id, { highlighted: true });
}
async function handleClear(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.locator(command2.selector).clear();
  return successResponse(command2.id, { cleared: true });
}
async function handleSelectAll(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.locator(command2.selector).selectText();
  return successResponse(command2.id, { selected: true });
}
async function handleInnerText(command2, browser2) {
  const page2 = browser2.getPage();
  const text = await page2.locator(command2.selector).innerText();
  return successResponse(command2.id, { text });
}
async function handleInnerHtml(command2, browser2) {
  const page2 = browser2.getPage();
  const html = await page2.locator(command2.selector).innerHTML();
  return successResponse(command2.id, { html, origin: page2.url() });
}
async function handleInputValue(command2, browser2) {
  const page2 = browser2.getPage();
  const locator2 = browser2.getLocator(command2.selector);
  const value = await locator2.inputValue();
  return successResponse(command2.id, { value, origin: page2.url() });
}
async function handleSetValue(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.locator(command2.selector).fill(command2.value);
  return successResponse(command2.id, { set: true });
}
async function handleDispatch(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.locator(command2.selector).dispatchEvent(command2.event, command2.eventInit);
  return successResponse(command2.id, { dispatched: command2.event });
}
async function handleEvalHandle(command2, browser2) {
  const page2 = browser2.getPage();
  const handle = await page2.evaluateHandle(command2.script);
  const result = await handle.jsonValue().catch(() => "Handle (non-serializable)");
  return successResponse(command2.id, { result });
}
async function handleExpose(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.exposeFunction(command2.name, () => {
    return `Function ${command2.name} called`;
  });
  return successResponse(command2.id, { exposed: command2.name });
}
async function handleAddScript(command2, browser2) {
  const page2 = browser2.getPage();
  if (command2.content) {
    await page2.addScriptTag({ content: command2.content });
  } else if (command2.url) {
    await page2.addScriptTag({ url: command2.url });
  }
  return successResponse(command2.id, { added: true });
}
async function handleAddStyle(command2, browser2) {
  const page2 = browser2.getPage();
  if (command2.content) {
    await page2.addStyleTag({ content: command2.content });
  } else if (command2.url) {
    await page2.addStyleTag({ url: command2.url });
  }
  return successResponse(command2.id, { added: true });
}
async function handleEmulateMedia(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.emulateMedia({
    media: command2.media,
    colorScheme: command2.colorScheme,
    reducedMotion: command2.reducedMotion,
    forcedColors: command2.forcedColors
  });
  if (command2.colorScheme) {
    browser2.setColorScheme(command2.colorScheme);
  }
  return successResponse(command2.id, { emulated: true });
}
async function handleOffline(command2, browser2) {
  await browser2.setOffline(command2.offline);
  return successResponse(command2.id, { offline: command2.offline });
}
async function handleHeaders(command2, browser2) {
  await browser2.setExtraHeaders(command2.headers);
  return successResponse(command2.id, { set: true });
}
async function handlePause(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.pause();
  return successResponse(command2.id, { paused: true });
}
async function handleGetByAltText(command2, browser2) {
  const page2 = browser2.getPage();
  const locator2 = page2.getByAltText(command2.text, { exact: command2.exact });
  switch (command2.subaction) {
    case "click":
      await locator2.click();
      return successResponse(command2.id, { clicked: true });
    case "hover":
      await locator2.hover();
      return successResponse(command2.id, { hovered: true });
  }
}
async function handleGetByTitle(command2, browser2) {
  const page2 = browser2.getPage();
  const locator2 = page2.getByTitle(command2.text, { exact: command2.exact });
  switch (command2.subaction) {
    case "click":
      await locator2.click();
      return successResponse(command2.id, { clicked: true });
    case "hover":
      await locator2.hover();
      return successResponse(command2.id, { hovered: true });
  }
}
async function handleGetByTestId(command2, browser2) {
  const page2 = browser2.getPage();
  const locator2 = page2.getByTestId(command2.testId);
  switch (command2.subaction) {
    case "click":
      await locator2.click();
      return successResponse(command2.id, { clicked: true });
    case "fill":
      await locator2.fill(command2.value ?? "");
      return successResponse(command2.id, { filled: true });
    case "check":
      await locator2.check();
      return successResponse(command2.id, { checked: true });
    case "hover":
      await locator2.hover();
      return successResponse(command2.id, { hovered: true });
  }
}
async function handleNth(command2, browser2) {
  const page2 = browser2.getPage();
  const base = page2.locator(command2.selector);
  const locator2 = command2.index === -1 ? base.last() : base.nth(command2.index);
  switch (command2.subaction) {
    case "click":
      await locator2.click();
      return successResponse(command2.id, { clicked: true });
    case "fill":
      await locator2.fill(command2.value ?? "");
      return successResponse(command2.id, { filled: true });
    case "check":
      await locator2.check();
      return successResponse(command2.id, { checked: true });
    case "hover":
      await locator2.hover();
      return successResponse(command2.id, { hovered: true });
    case "text":
      const text = await locator2.textContent();
      return successResponse(command2.id, { text });
  }
}
async function handleWaitForUrl(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.waitForURL(command2.url, { timeout: command2.timeout });
  return successResponse(command2.id, { url: page2.url() });
}
async function handleWaitForLoadState(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.waitForLoadState(command2.state, { timeout: command2.timeout });
  return successResponse(command2.id, { state: command2.state });
}
async function handleSetContent(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.setContent(command2.html);
  return successResponse(command2.id, { set: true });
}
async function handleTimezone(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.context().setGeolocation({ latitude: 0, longitude: 0 });
  return successResponse(command2.id, {
    note: "Timezone must be set at browser launch. Use --timezone flag.",
    timezone: command2.timezone
  });
}
async function handleLocale(command2, browser2) {
  return successResponse(command2.id, {
    note: "Locale must be set at browser launch. Use --locale flag.",
    locale: command2.locale
  });
}
async function handleCredentials(command2, browser2) {
  const context = browser2.getPage().context();
  await context.setHTTPCredentials({
    username: command2.username,
    password: command2.password
  });
  return successResponse(command2.id, { set: true });
}
async function handleMouseMove(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.mouse.move(command2.x, command2.y);
  return successResponse(command2.id, { moved: true, x: command2.x, y: command2.y });
}
async function handleMouseDown(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.mouse.down({ button: command2.button ?? "left" });
  return successResponse(command2.id, { down: true });
}
async function handleMouseUp(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.mouse.up({ button: command2.button ?? "left" });
  return successResponse(command2.id, { up: true });
}
async function handleBringToFront(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.bringToFront();
  return successResponse(command2.id, { focused: true });
}
async function handleWaitForFunction(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.waitForFunction(command2.expression, { timeout: command2.timeout });
  return successResponse(command2.id, { waited: true });
}
async function handleScrollIntoView(command2, browser2) {
  await browser2.getLocator(command2.selector).scrollIntoViewIfNeeded();
  return successResponse(command2.id, { scrolled: true });
}
async function handleAddInitScript(command2, browser2) {
  const context = browser2.getPage().context();
  await context.addInitScript(command2.script);
  return successResponse(command2.id, { added: true });
}
async function handleKeyDown(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.keyboard.down(command2.key);
  return successResponse(command2.id, { down: true, key: command2.key });
}
async function handleKeyUp(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.keyboard.up(command2.key);
  return successResponse(command2.id, { up: true, key: command2.key });
}
async function handleInsertText(command2, browser2) {
  const page2 = browser2.getPage();
  await page2.keyboard.insertText(command2.text);
  return successResponse(command2.id, { inserted: true });
}
async function handleMultiSelect(command2, browser2) {
  const page2 = browser2.getPage();
  const selected = await page2.locator(command2.selector).selectOption(command2.values);
  return successResponse(command2.id, { selected });
}
async function handleWaitForDownload(command2, browser2) {
  const page2 = browser2.getPage();
  const download = await page2.waitForEvent("download", { timeout: command2.timeout });
  let filePath;
  if (command2.path) {
    filePath = command2.path;
    await download.saveAs(filePath);
  } else {
    const downloadDir = browser2.getDownloadPath();
    const filename = download.suggestedFilename();
    if (downloadDir) {
      filePath = path5.join(downloadDir, filename);
      await download.saveAs(filePath);
    } else {
      filePath = await download.path() || filename;
    }
  }
  return successResponse(command2.id, {
    path: filePath,
    filename: download.suggestedFilename(),
    url: download.url()
  });
}
async function handleResponseBody(command2, browser2) {
  const page2 = browser2.getPage();
  const response = await page2.waitForResponse((resp) => resp.url().includes(command2.url), {
    timeout: command2.timeout
  });
  const body = await response.text();
  let parsed = body;
  try {
    parsed = JSON.parse(body);
  } catch {
  }
  return successResponse(command2.id, {
    url: response.url(),
    status: response.status(),
    body: parsed
  });
}
async function handleScreencastStart(command2, browser2) {
  if (!screencastFrameCallback) {
    throw new Error("Screencast frame callback not set. Start the streaming server first.");
  }
  await browser2.startScreencast(screencastFrameCallback, {
    format: command2.format,
    quality: command2.quality,
    maxWidth: command2.maxWidth,
    maxHeight: command2.maxHeight,
    everyNthFrame: command2.everyNthFrame
  });
  return successResponse(command2.id, {
    started: true,
    format: command2.format ?? "jpeg",
    quality: command2.quality ?? 80
  });
}
async function handleScreencastStop(command2, browser2) {
  await browser2.stopScreencast();
  return successResponse(command2.id, { stopped: true });
}
async function handleInputMouse(command2, browser2) {
  await browser2.injectMouseEvent({
    type: command2.type,
    x: command2.x,
    y: command2.y,
    button: command2.button,
    clickCount: command2.clickCount,
    deltaX: command2.deltaX,
    deltaY: command2.deltaY,
    modifiers: command2.modifiers
  });
  return successResponse(command2.id, { injected: true });
}
async function handleInputKeyboard(command2, browser2) {
  await browser2.injectKeyboardEvent({
    type: command2.type,
    key: command2.key,
    code: command2.code,
    text: command2.text,
    modifiers: command2.modifiers
  });
  return successResponse(command2.id, { injected: true });
}
async function handleInputTouch(command2, browser2) {
  await browser2.injectTouchEvent({
    type: command2.type,
    touchPoints: command2.touchPoints,
    modifiers: command2.modifiers
  });
  return successResponse(command2.id, { injected: true });
}
async function handleRecordingStart(command2, browser2) {
  await browser2.startRecording(command2.path, command2.url);
  return successResponse(command2.id, {
    started: true,
    path: command2.path
  });
}
async function handleRecordingStop(command2, browser2) {
  const result = await browser2.stopRecording();
  return successResponse(command2.id, result);
}
async function handleRecordingRestart(command2, browser2) {
  const result = await browser2.restartRecording(command2.path, command2.url);
  return successResponse(command2.id, {
    started: true,
    path: command2.path,
    previousPath: result.previousPath,
    stopped: result.stopped
  });
}
async function handleDiffSnapshot(command2, browser2) {
  let before;
  if (command2.baseline) {
    try {
      before = fs2.readFileSync(command2.baseline, "utf-8");
    } catch {
      return errorResponse(command2.id, `Cannot read baseline file: ${command2.baseline}`);
    }
  } else {
    before = browser2.getLastSnapshot();
    if (!before) {
      return errorResponse(
        command2.id,
        "No previous snapshot in this session. Take a snapshot first, or use --baseline <file>."
      );
    }
  }
  const page2 = browser2.getPage();
  const { tree } = await getEnhancedSnapshot(page2, {
    selector: command2.selector,
    compact: command2.compact,
    maxDepth: command2.maxDepth
  });
  const after = tree || "Empty page";
  const result = diffSnapshots(before, after);
  browser2.setLastSnapshot(after);
  return successResponse(command2.id, result);
}
async function handleDiffScreenshot(command2, browser2) {
  if (!fs2.existsSync(command2.baseline)) {
    return errorResponse(command2.id, `Baseline file not found: ${command2.baseline}`);
  }
  const page2 = browser2.getPage();
  let screenshotBuffer;
  if (command2.selector) {
    const locator2 = browser2.getLocatorFromRef(command2.selector) || page2.locator(command2.selector);
    screenshotBuffer = await locator2.screenshot({ type: "png" });
  } else {
    screenshotBuffer = await page2.screenshot({ fullPage: command2.fullPage, type: "png" });
  }
  const baselineBuffer = fs2.readFileSync(command2.baseline);
  const ext = path5.extname(command2.baseline).toLowerCase();
  const baselineMime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  const result = await diffScreenshots(page2.context(), baselineBuffer, screenshotBuffer, {
    threshold: command2.threshold,
    outputPath: command2.output,
    baselineMime
  });
  return successResponse(command2.id, result);
}
async function handleDiffUrl(command2, browser2) {
  const page2 = browser2.getPage();
  const waitUntil = command2.waitUntil ?? "load";
  const snapshotOpts = {
    selector: command2.selector,
    compact: command2.compact,
    maxDepth: command2.maxDepth
  };
  await page2.goto(command2.url1, { waitUntil });
  const { tree: tree1 } = await getEnhancedSnapshot(page2, snapshotOpts);
  const snapshot1 = tree1 || "Empty page";
  let screenshot1;
  if (command2.screenshot) {
    screenshot1 = await page2.screenshot({ fullPage: command2.fullPage, type: "png" });
  }
  await page2.goto(command2.url2, { waitUntil });
  const { tree: tree2 } = await getEnhancedSnapshot(page2, snapshotOpts);
  const snapshot2 = tree2 || "Empty page";
  const snapshotDiff = diffSnapshots(snapshot1, snapshot2);
  const result = { snapshot: snapshotDiff };
  if (command2.screenshot && screenshot1) {
    const screenshot2 = await page2.screenshot({ fullPage: command2.fullPage, type: "png" });
    result.screenshot = await diffScreenshots(page2.context(), screenshot1, screenshot2, {});
  }
  return successResponse(command2.id, result);
}
async function handleAuthLogin(command2, browser2) {
  const profile = getAuthProfile(command2.name);
  if (!profile) {
    return errorResponse(command2.id, `Auth profile '${command2.name}' not found`);
  }
  browser2.checkDomainAllowed(profile.url);
  const page2 = browser2.getPage();
  await page2.goto(profile.url, { waitUntil: "load" });
  const usingAutoDetect = !profile.usernameSelector && !profile.passwordSelector && !profile.submitSelector;
  if (usingAutoDetect) {
    console.error(
      `[agent-browser] Auth login '${command2.name}': using auto-detected form selectors. If login fails, specify --username-selector/--password-selector/--submit-selector with auth save.`
    );
  }
  const passSel = profile.passwordSelector || 'input[type="password"]:visible';
  const AUTO_USER_SELECTORS = [
    'input[autocomplete="username"]:visible',
    'input[type="email"]:visible',
    'input[name="username"]:visible',
    'input[name="email"]:visible'
  ];
  const AUTO_SUBMIT_SELECTORS = ['button[type="submit"]:visible', 'input[type="submit"]:visible'];
  try {
    let userLocator;
    if (profile.usernameSelector) {
      userLocator = page2.locator(profile.usernameSelector).first();
    } else {
      userLocator = null;
      for (const sel of AUTO_USER_SELECTORS) {
        const loc = page2.locator(sel).first();
        if (await loc.isVisible({ timeout: 1e3 }).catch(() => false)) {
          userLocator = loc;
          break;
        }
      }
      if (!userLocator) {
        return errorResponse(
          command2.id,
          `Auth login failed for '${command2.name}': could not find username field. Specify --username-selector with auth save.`
        );
      }
    }
    let submitLocator;
    if (profile.submitSelector) {
      submitLocator = page2.locator(profile.submitSelector).first();
    } else {
      submitLocator = null;
      for (const sel of AUTO_SUBMIT_SELECTORS) {
        const loc = page2.locator(sel).first();
        if (await loc.isVisible({ timeout: 1e3 }).catch(() => false)) {
          submitLocator = loc;
          break;
        }
      }
      if (!submitLocator) {
        return errorResponse(
          command2.id,
          `Auth login failed for '${command2.name}': could not find submit button. Specify --submit-selector with auth save.`
        );
      }
    }
    await userLocator.fill(profile.username);
    await page2.locator(passSel).first().fill(profile.password);
    await submitLocator.click();
    await page2.waitForLoadState("load");
  } catch (err) {
    return errorResponse(
      command2.id,
      `Auth login failed for '${command2.name}': ${err instanceof Error ? err.message : err}. Try specifying custom selectors with auth save --username-selector/--password-selector/--submit-selector`
    );
  }
  updateLastLogin(command2.name);
  return successResponse(command2.id, {
    loggedIn: true,
    name: command2.name,
    url: page2.url(),
    title: await page2.title()
  });
}
async function handleConfirm(command2, browser2) {
  const entry = getAndRemovePending(command2.confirmationId);
  if (!entry) {
    return errorResponse(command2.id, `No pending confirmation with id '${command2.confirmationId}'`);
  }
  const parseResult = parseCommand(JSON.stringify(entry.command));
  if (!parseResult.success) {
    return errorResponse(command2.id, `Stored command is no longer valid: ${parseResult.error}`);
  }
  const originalCommand = parseResult.command;
  actionPolicy = reloadPolicyIfChanged();
  const decision = checkPolicy(originalCommand.action, actionPolicy, /* @__PURE__ */ new Set());
  if (decision === "deny") {
    const category = getActionCategory(originalCommand.action);
    return errorResponse(command2.id, `Action denied by policy: '${category}' is not allowed`);
  }
  return await dispatchAction(originalCommand, browser2);
}
function handleDeny(command2) {
  const entry = getAndRemovePending(command2.confirmationId);
  if (!entry) {
    return errorResponse(command2.id, `No pending confirmation with id '${command2.confirmationId}'`);
  }
  return successResponse(command2.id, { denied: true });
}

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/wrapper.mjs
var import_stream = __toESM(require_stream(), 1);
var import_receiver = __toESM(require_receiver(), 1);
var import_sender = __toESM(require_sender(), 1);
var import_websocket = __toESM(require_websocket(), 1);
var import_websocket_server = __toESM(require_websocket_server(), 1);

// src/stream-server.ts
function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }
  if (origin.startsWith("file://")) {
    return true;
  }
  try {
    const url = new URL(origin);
    const host = url.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") {
      return true;
    }
  } catch {
  }
  return false;
}
var StreamServer = class {
  wss = null;
  clients = /* @__PURE__ */ new Set();
  browser;
  port;
  isScreencasting = false;
  constructor(browser2, port = 9223) {
    this.browser = browser2;
    this.port = port;
  }
  /**
   * Start the WebSocket server
   */
  start() {
    return new Promise((resolve2, reject) => {
      try {
        this.wss = new import_websocket_server.default({
          port: this.port,
          host: "127.0.0.1",
          // Security: Reject cross-origin WebSocket connections from untrusted origins.
          // This prevents malicious web pages from connecting and injecting input events.
          // Localhost origins are allowed so browser-based stream viewers can connect.
          verifyClient: (info) => {
            if (isAllowedOrigin(info.origin)) {
              return true;
            }
            console.log(`[StreamServer] Rejected connection from origin: ${info.origin}`);
            return false;
          }
        });
        this.wss.on("connection", (ws) => {
          this.handleConnection(ws);
        });
        this.wss.on("error", (error) => {
          console.error("[StreamServer] WebSocket error:", error);
          reject(error);
        });
        this.wss.on("listening", () => {
          console.log(`[StreamServer] Listening on port ${this.port}`);
          setScreencastFrameCallback((frame) => {
            this.broadcastFrame(frame);
          });
          resolve2();
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  /**
   * Stop the WebSocket server
   */
  async stop() {
    if (this.isScreencasting) {
      await this.stopScreencast();
    }
    setScreencastFrameCallback(null);
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
    if (this.wss) {
      return new Promise((resolve2) => {
        this.wss.close(() => {
          this.wss = null;
          resolve2();
        });
      });
    }
  }
  /**
   * Handle a new WebSocket connection
   */
  handleConnection(ws) {
    console.log("[StreamServer] Client connected");
    this.clients.add(ws);
    this.sendStatus(ws);
    if (this.clients.size === 1 && !this.isScreencasting) {
      this.startScreencast().catch((error) => {
        console.error("[StreamServer] Failed to start screencast:", error);
        this.sendError(ws, error.message);
      });
    }
    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message, ws);
      } catch (error) {
        console.error("[StreamServer] Failed to parse message:", error);
      }
    });
    ws.on("close", () => {
      console.log("[StreamServer] Client disconnected");
      this.clients.delete(ws);
      if (this.clients.size === 0 && this.isScreencasting) {
        this.stopScreencast().catch((error) => {
          console.error("[StreamServer] Failed to stop screencast:", error);
        });
      }
    });
    ws.on("error", (error) => {
      console.error("[StreamServer] Client error:", error);
      this.clients.delete(ws);
    });
  }
  /**
   * Handle incoming messages from clients
   */
  async handleMessage(message, ws) {
    try {
      switch (message.type) {
        case "input_mouse":
          await this.browser.injectMouseEvent({
            type: message.eventType,
            x: message.x,
            y: message.y,
            button: message.button,
            clickCount: message.clickCount,
            deltaX: message.deltaX,
            deltaY: message.deltaY,
            modifiers: message.modifiers
          });
          break;
        case "input_keyboard":
          await this.browser.injectKeyboardEvent({
            type: message.eventType,
            key: message.key,
            code: message.code,
            text: message.text,
            modifiers: message.modifiers
          });
          break;
        case "input_touch":
          await this.browser.injectTouchEvent({
            type: message.eventType,
            touchPoints: message.touchPoints,
            modifiers: message.modifiers
          });
          break;
        case "status":
          this.sendStatus(ws);
          break;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.sendError(ws, errorMessage);
    }
  }
  /**
   * Broadcast a frame to all connected clients
   */
  broadcastFrame(frame) {
    const message = {
      type: "frame",
      data: frame.data,
      metadata: frame.metadata
    };
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === import_websocket.default.OPEN) {
        client.send(payload);
      }
    }
  }
  /**
   * Send status to a client
   */
  sendStatus(ws) {
    let viewportWidth;
    let viewportHeight;
    try {
      const page2 = this.browser.getPage();
      const viewport = page2.viewportSize();
      viewportWidth = viewport?.width;
      viewportHeight = viewport?.height;
    } catch {
    }
    const message = {
      type: "status",
      connected: true,
      screencasting: this.isScreencasting,
      viewportWidth,
      viewportHeight
    };
    if (ws.readyState === import_websocket.default.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
  /**
   * Send an error to a client
   */
  sendError(ws, errorMessage) {
    const message = {
      type: "error",
      message: errorMessage
    };
    if (ws.readyState === import_websocket.default.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
  /**
   * Start screencasting
   */
  async startScreencast() {
    if (this.isScreencasting) return;
    this.isScreencasting = true;
    try {
      if (!this.browser.isLaunched()) {
        throw new Error("Browser not launched");
      }
      await this.browser.startScreencast((frame) => this.broadcastFrame(frame), {
        format: "jpeg",
        quality: 80,
        maxWidth: 1280,
        maxHeight: 720,
        everyNthFrame: 1
      });
      for (const client of this.clients) {
        this.sendStatus(client);
      }
    } catch (error) {
      this.isScreencasting = false;
      throw error;
    }
  }
  /**
   * Stop screencasting
   */
  async stopScreencast() {
    if (!this.isScreencasting) return;
    await this.browser.stopScreencast();
    this.isScreencasting = false;
    for (const client of this.clients) {
      this.sendStatus(client);
    }
  }
  /**
   * Get the port the server is running on
   */
  getPort() {
    return this.port;
  }
  /**
   * Get the number of connected clients
   */
  getClientCount() {
    return this.clients.size;
  }
};

// src/daemon.ts
function safeWrite(socket, payload) {
  return new Promise((resolve2, reject) => {
    if (socket.destroyed) {
      resolve2();
      return;
    }
    const canContinue = socket.write(payload);
    if (canContinue) {
      resolve2();
    } else if (socket.destroyed) {
      resolve2();
    } else {
      const cleanup = () => {
        socket.removeListener("drain", onDrain);
        socket.removeListener("error", onError);
        socket.removeListener("close", onClose);
      };
      const onDrain = () => {
        cleanup();
        resolve2();
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      const onClose = () => {
        cleanup();
        resolve2();
      };
      socket.once("drain", onDrain);
      socket.once("error", onError);
      socket.once("close", onClose);
    }
  });
}
var isWindows = process.platform === "win32";
var currentSession = process.env.AGENT_BROWSER_SESSION || "default";
var streamServer = null;
async function saveStateToFile(browser2, filepath) {
  const context = browser2.getContext();
  if (!context) {
    throw new Error("No browser context available");
  }
  const state = await context.storageState();
  const jsonData = JSON.stringify(state, null, 2);
  const key = getEncryptionKey();
  if (key) {
    const encrypted = encryptData(jsonData, key);
    fs3.writeFileSync(filepath, JSON.stringify(encrypted, null, 2));
    return { encrypted: true };
  }
  fs3.writeFileSync(filepath, jsonData);
  return { encrypted: false };
}
var AUTO_EXPIRE_ENV = "AGENT_BROWSER_STATE_EXPIRE_DAYS";
var DEFAULT_EXPIRE_DAYS = 30;
function runCleanupExpiredStates() {
  const expireDaysStr = process.env[AUTO_EXPIRE_ENV];
  const expireDays = expireDaysStr ? parseInt(expireDaysStr, 10) : DEFAULT_EXPIRE_DAYS;
  if (isNaN(expireDays) || expireDays <= 0) {
    return;
  }
  try {
    const deleted = cleanupExpiredStates(expireDays);
    if (deleted.length > 0 && process.env.AGENT_BROWSER_DEBUG === "1") {
      console.error(
        `[DEBUG] Auto-expired ${deleted.length} state file(s) older than ${expireDays} days`
      );
    }
  } catch (err) {
    if (process.env.AGENT_BROWSER_DEBUG === "1") {
      console.error(`[DEBUG] Failed to clean up expired states:`, err);
    }
  }
}
function getSessionAutoStatePath() {
  const sessionNameRaw = process.env.AGENT_BROWSER_SESSION_NAME;
  if (!sessionNameRaw) return void 0;
  if (!isValidSessionName(sessionNameRaw)) {
    if (process.env.AGENT_BROWSER_DEBUG === "1") {
      console.error(`[SECURITY] Invalid session name rejected: ${sessionNameRaw}`);
    }
    return void 0;
  }
  const sessionId = process.env.AGENT_BROWSER_SESSION || "default";
  try {
    const autoStatePath = getAutoStateFilePath(sessionNameRaw, sessionId);
    return autoStatePath && fs3.existsSync(autoStatePath) ? autoStatePath : void 0;
  } catch {
    return void 0;
  }
}
function getSessionSaveStatePath() {
  const sessionNameRaw = process.env.AGENT_BROWSER_SESSION_NAME;
  if (!sessionNameRaw) return void 0;
  if (!isValidSessionName(sessionNameRaw)) return void 0;
  const sessionId = process.env.AGENT_BROWSER_SESSION || "default";
  try {
    return getAutoStateFilePath(sessionNameRaw, sessionId) ?? void 0;
  } catch {
    return void 0;
  }
}
function setSession(session) {
  currentSession = session;
}
function getSession() {
  return currentSession;
}
function getAppDir() {
  if (process.env.XDG_RUNTIME_DIR) {
    return path6.join(process.env.XDG_RUNTIME_DIR, "agent-browser");
  }
  const homeDir = os5.homedir();
  if (homeDir) {
    return path6.join(homeDir, ".agent-browser");
  }
  return path6.join(os5.tmpdir(), "agent-browser");
}
function getSocketDir() {
  if (process.env.AGENT_BROWSER_SOCKET_DIR) {
    return process.env.AGENT_BROWSER_SOCKET_DIR;
  }
  return getAppDir();
}
function getSocketPath(session) {
  const sess = session ?? currentSession;
  if (isWindows) {
    const portFile = getPortFile(sess);
    if (fs3.existsSync(portFile)) {
      return fs3.readFileSync(portFile, "utf-8").trim();
    }
    return "0";
  }
  return path6.join(getSocketDir(), `${sess}.sock`);
}
function getPortFile(session) {
  const sess = session ?? currentSession;
  return path6.join(getSocketDir(), `${sess}.port`);
}
function getPidFile(session) {
  const sess = session ?? currentSession;
  return path6.join(getSocketDir(), `${sess}.pid`);
}
function isDaemonRunning(session) {
  const pidFile = getPidFile(session);
  if (!fs3.existsSync(pidFile)) return false;
  try {
    const pid = parseInt(fs3.readFileSync(pidFile, "utf8").trim(), 10);
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err instanceof Error && err.code === "EPERM") {
      return true;
    }
    cleanupSocket(session);
    return false;
  }
}
function getConnectionInfo(session) {
  const sess = session ?? currentSession;
  if (isWindows) {
    const portFile = getPortFile(sess);
    if (fs3.existsSync(portFile)) {
      const port = parseInt(fs3.readFileSync(portFile, "utf-8").trim(), 10);
      return { type: "tcp", port };
    }
    return { type: "tcp", port: 0 };
  }
  return { type: "unix", path: path6.join(getSocketDir(), `${sess}.sock`) };
}
function cleanupSocket(session) {
  const pidFile = getPidFile(session);
  const streamPortFile = getStreamPortFile(session);
  try {
    if (fs3.existsSync(pidFile)) fs3.unlinkSync(pidFile);
    if (fs3.existsSync(streamPortFile)) fs3.unlinkSync(streamPortFile);
    if (isWindows) {
      const portFile = getPortFile(session);
      if (fs3.existsSync(portFile)) fs3.unlinkSync(portFile);
    } else {
      const socketPath = getSocketPath(session);
      if (fs3.existsSync(socketPath)) fs3.unlinkSync(socketPath);
    }
  } catch {
  }
}
function getStreamPortFile(session) {
  const sess = session ?? currentSession;
  return path6.join(getSocketDir(), `${sess}.stream`);
}
async function startDaemon(options) {
  const socketDir = getSocketDir();
  if (!fs3.existsSync(socketDir)) {
    fs3.mkdirSync(socketDir, { recursive: true, mode: 448 });
  }
  cleanupSocket();
  runCleanupExpiredStates();
  initActionPolicy();
  const manager = new BrowserManager();
  let shuttingDown = false;
  const streamPort = options?.streamPort ?? (process.env.AGENT_BROWSER_STREAM_PORT ? parseInt(process.env.AGENT_BROWSER_STREAM_PORT, 10) : 0);
  if (streamPort > 0) {
    streamServer = new StreamServer(manager, streamPort);
    await streamServer.start();
    const streamPortFile = getStreamPortFile();
    fs3.writeFileSync(streamPortFile, streamPort.toString());
  }
  const server = net.createServer((socket) => {
    let buffer = "";
    let httpChecked = false;
    const commandQueue = [];
    let processing = false;
    async function processQueue() {
      if (processing) return;
      processing = true;
      while (commandQueue.length > 0) {
        const line = commandQueue.shift();
        try {
          const parseResult = parseCommand(line);
          if (!parseResult.success) {
            const resp = errorResponse(parseResult.id ?? "unknown", parseResult.error);
            await safeWrite(socket, serializeResponse(resp) + "\n");
            continue;
          }
          if (!manager.isLaunched() && parseResult.command.action !== "launch" && parseResult.command.action !== "close" && parseResult.command.action !== "state_load") {
            const extensions = process.env.AGENT_BROWSER_EXTENSIONS ? process.env.AGENT_BROWSER_EXTENSIONS.split(/[,\n]/).map((p) => p.trim()).filter(Boolean) : void 0;
            const argsEnv = process.env.AGENT_BROWSER_ARGS;
            const args = argsEnv ? argsEnv.split(/[,\n]/).map((a) => a.trim()).filter((a) => a.length > 0) : void 0;
            const proxyServer = process.env.AGENT_BROWSER_PROXY;
            const proxyBypass = process.env.AGENT_BROWSER_PROXY_BYPASS;
            const proxy = proxyServer ? {
              server: proxyServer,
              ...proxyBypass && { bypass: proxyBypass }
            } : void 0;
            const ignoreHTTPSErrors = process.env.AGENT_BROWSER_IGNORE_HTTPS_ERRORS === "1";
            const allowFileAccess = process.env.AGENT_BROWSER_ALLOW_FILE_ACCESS === "1";
            const colorSchemeEnv = process.env.AGENT_BROWSER_COLOR_SCHEME;
            const colorScheme = colorSchemeEnv === "dark" || colorSchemeEnv === "light" || colorSchemeEnv === "no-preference" ? colorSchemeEnv : void 0;
            const explicitProfile = process.env.AGENT_BROWSER_PROFILE;
            const defaultProfile = !explicitProfile && !process.env.AGENT_BROWSER_STATE && !process.env.AGENT_BROWSER_SESSION_NAME && !extensions ? path6.join(os5.homedir(), ".agent-browser", "profile") : void 0;
            const _debugLogPath = path6.join(os5.homedir(), ".agent-browser", "debug.log");
            const _debugLines = [
              `[${(/* @__PURE__ */ new Date()).toISOString()}] === AUTO-LAUNCH DEBUG ===`,
              `  AGENT_BROWSER_PROFILE env: ${JSON.stringify(process.env.AGENT_BROWSER_PROFILE)}`,
              `  AGENT_BROWSER_STATE env: ${JSON.stringify(process.env.AGENT_BROWSER_STATE)}`,
              `  AGENT_BROWSER_SESSION_NAME env: ${JSON.stringify(process.env.AGENT_BROWSER_SESSION_NAME)}`,
              `  AGENT_BROWSER_EXTENSIONS env: ${JSON.stringify(process.env.AGENT_BROWSER_EXTENSIONS)}`,
              `  AGENT_BROWSER_HEADED env: ${JSON.stringify(process.env.AGENT_BROWSER_HEADED)}`,
              `  extensions parsed: ${JSON.stringify(extensions)}`,
              `  explicitProfile: ${JSON.stringify(explicitProfile)}`,
              `  defaultProfile: ${JSON.stringify(defaultProfile)}`,
              `  final profile value: ${JSON.stringify(explicitProfile || defaultProfile)}`,
              `  homedir: ${os5.homedir()}`,
              `  action: ${parseResult.command.action}`,
              `  isLaunched: ${manager.isLaunched()}`
            ];
            try {
              fs3.mkdirSync(path6.dirname(_debugLogPath), { recursive: true });
              fs3.appendFileSync(_debugLogPath, _debugLines.join("\n") + "\n\n");
            } catch (_e) {
            }
            await manager.launch({
              id: "auto",
              action: "launch",
              headless: process.env.AGENT_BROWSER_HEADED !== "1" && process.env.AGENT_BROWSER_HEADED !== "true",
              executablePath: process.env.AGENT_BROWSER_EXECUTABLE_PATH,
              extensions,
              profile: explicitProfile || defaultProfile,
              storageState: process.env.AGENT_BROWSER_STATE,
              args,
              userAgent: process.env.AGENT_BROWSER_USER_AGENT,
              proxy,
              ignoreHTTPSErrors,
              allowFileAccess,
              colorScheme,
              downloadPath: process.env.AGENT_BROWSER_DOWNLOAD_PATH,
              autoStateFilePath: getSessionAutoStatePath()
            });
          }
          if (manager.isLaunched() && !manager.hasPages() && parseResult.command.action !== "launch" && parseResult.command.action !== "close") {
            await manager.ensurePage();
          }
          if (parseResult.command.action === "launch" && !parseResult.command.autoStateFilePath) {
            const autoStatePath = getSessionAutoStatePath();
            if (autoStatePath) {
              parseResult.command.autoStateFilePath = autoStatePath;
            }
          }
          if (parseResult.command.action === "launch" && !parseResult.command.profile && !parseResult.command.storageState && !parseResult.command.extensions?.length && !process.env.AGENT_BROWSER_SESSION_NAME) {
            parseResult.command.profile = path6.join(os5.homedir(), ".agent-browser", "profile");
          }
          if (parseResult.command.action === "close") {
            if (manager.isLaunched()) {
              const savePath = getSessionSaveStatePath();
              if (savePath) {
                try {
                  const { encrypted } = await saveStateToFile(manager, savePath);
                  fs3.chmodSync(savePath, 384);
                  if (process.env.AGENT_BROWSER_DEBUG === "1") {
                    console.error(
                      `Auto-saved session state: ${savePath}${encrypted ? " (encrypted)" : ""}`
                    );
                  }
                } catch (err) {
                  if (process.env.AGENT_BROWSER_DEBUG === "1") {
                    console.error(`Failed to auto-save session state:`, err);
                  }
                }
              }
            }
            const response2 = await executeCommand(parseResult.command, manager);
            await safeWrite(socket, serializeResponse(response2) + "\n");
            if (!shuttingDown) {
              shuttingDown = true;
              setTimeout(() => {
                server.close();
                cleanupSocket();
                process.exit(0);
              }, 100);
            }
            commandQueue.length = 0;
            processing = false;
            return;
          }
          const response = await executeCommand(parseResult.command, manager);
          const warnings = manager.getAndClearWarnings();
          if (warnings.length > 0 && response.success && response.data) {
            response.data.warnings = warnings;
          }
          await safeWrite(socket, serializeResponse(response) + "\n");
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await safeWrite(socket, serializeResponse(errorResponse("error", message)) + "\n").catch(
            () => {
            }
          );
        }
      }
      processing = false;
    }
    socket.on("data", (data) => {
      buffer += data.toString();
      if (!httpChecked) {
        httpChecked = true;
        const trimmed = buffer.trimStart();
        if (/^(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH|CONNECT|TRACE)\s/i.test(trimmed)) {
          socket.destroy();
          return;
        }
      }
      while (buffer.includes("\n")) {
        const newlineIdx = buffer.indexOf("\n");
        const line = buffer.substring(0, newlineIdx);
        buffer = buffer.substring(newlineIdx + 1);
        if (!line.trim()) continue;
        commandQueue.push(line);
      }
      processQueue().catch((err) => {
        console.warn("[warn] processQueue error:", err?.message ?? String(err));
        if (process.env.AGENT_BROWSER_DEBUG === "1") {
          console.error(
            "[DEBUG] processQueue error stack:",
            err?.stack ?? err?.message ?? String(err)
          );
        }
      });
    });
    socket.on("error", () => {
    });
  });
  const pidFile = getPidFile();
  fs3.writeFileSync(pidFile, process.pid.toString());
  if (isWindows) {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const portFile = getPortFile();
        fs3.writeFileSync(portFile, addr.port.toString());
      }
    });
  } else {
    const socketPath = getSocketPath();
    server.listen(socketPath, () => {
    });
  }
  server.on("error", (err) => {
    console.error("Server error:", err);
    cleanupSocket();
    process.exit(1);
  });
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (streamServer) {
      await streamServer.stop();
      streamServer = null;
      const streamPortFile = getStreamPortFile();
      try {
        if (fs3.existsSync(streamPortFile)) fs3.unlinkSync(streamPortFile);
      } catch {
      }
    }
    await manager.close();
    server.close();
    cleanupSocket();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("SIGHUP", shutdown);
  process.on("uncaughtException", (err) => {
    console.error("Uncaught exception:", err);
    cleanupSocket();
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection:", reason);
    cleanupSocket();
    process.exit(1);
  });
  process.on("exit", () => {
    cleanupSocket();
  });
  process.stdin.resume();
}
if (process.argv[1]?.endsWith("daemon.js") || process.env.AGENT_BROWSER_DAEMON === "1") {
  startDaemon().catch((err) => {
    console.error("Daemon error:", err);
    cleanupSocket();
    process.exit(1);
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  cleanupSocket,
  getAppDir,
  getConnectionInfo,
  getPidFile,
  getPortFile,
  getSession,
  getSocketDir,
  getSocketPath,
  getStreamPortFile,
  isDaemonRunning,
  safeWrite,
  setSession,
  startDaemon
});
