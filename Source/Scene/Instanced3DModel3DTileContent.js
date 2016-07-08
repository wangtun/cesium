/*global define*/
define([
        '../Core/AttributeCompression',
        '../Core/Cartesian2',
        '../Core/Cartesian3',
        '../Core/Color',
        '../Core/defaultValue',
        '../Core/defined',
        '../Core/defineProperties',
        '../Core/destroyObject',
        '../Core/DeveloperError',
        '../Core/Ellipsoid',
        '../Core/getMagic',
        '../Core/getStringFromTypedArray',
        '../Core/joinUrls',
        '../Core/loadArrayBuffer',
        '../Core/Matrix3',
        '../Core/Matrix4',
        '../Core/Request',
        '../Core/RequestScheduler',
        '../Core/RequestType',
        '../Core/Transforms',
        '../ThirdParty/Uri',
        '../ThirdParty/when',
        './Cesium3DTileFeature',
        './Cesium3DTileBatchTableResources',
        './Cesium3DTileContentState',
        './ModelInstanceCollection'
    ], function(
        AttributeCompression,
        Cartesian2,
        Cartesian3,
        Color,
        defaultValue,
        defined,
        defineProperties,
        destroyObject,
        DeveloperError,
        Ellipsoid,
        getMagic,
        getStringFromTypedArray,
        joinUrls,
        loadArrayBuffer,
        Matrix3,
        Matrix4,
        Request,
        RequestScheduler,
        RequestType,
        Transforms,
        Uri,
        when,
        Cesium3DTileFeature,
        Cesium3DTileBatchTableResources,
        Cesium3DTileContentState,
        ModelInstanceCollection) {
    'use strict';

    /**
     * Represents the contents of a
     * {@link https://github.com/AnalyticalGraphicsInc/3d-tiles/blob/master/TileFormats/Instanced3DModel/README.md|Instanced 3D Model}
     * tile in a {@link https://github.com/AnalyticalGraphicsInc/3d-tiles/blob/master/README.md|3D Tiles} tileset.
     *
     * @alias Instanced3DModel3DTileContent
     * @constructor
     *
     * @private
     */
    function Instanced3DModel3DTileContent(tileset, tile, url) {
        this._modelInstanceCollection = undefined;
        this._url = url;
        this._tileset = tileset;
        this._tile = tile;

        /**
         * The following properties are part of the {@link Cesium3DTileContent} interface.
         */
        this.state = Cesium3DTileContentState.UNLOADED;
        this.contentReadyToProcessPromise = when.defer();
        this.readyPromise = when.defer();
        this.batchTableResources = undefined;
        this.featurePropertiesDirty = false;

        this._features = undefined;
    }

    defineProperties(Instanced3DModel3DTileContent.prototype, {
        /**
         * Part of the {@link Cesium3DTileContent} interface.
         */
        featuresLength : {
            get : function() {
                return this._modelInstanceCollection.length;
            }
        },

        /**
         * Part of the {@link Cesium3DTileContent} interface.
         */
        innerContents : {
            get : function() {
                return undefined;
            }
        }
    });

    function createFeatures(content) {
        var tileset = content._tileset;
        var featuresLength = content.featuresLength;
        if (!defined(content._features) && (featuresLength > 0)) {
            var features = new Array(featuresLength);
            for (var i = 0; i < featuresLength; ++i) {
                features[i] = new Cesium3DTileFeature(tileset, content, i);
            }
            content._features = features;
        }
    }

    /**
     * Part of the {@link Cesium3DTileContent} interface.
     */
    Instanced3DModel3DTileContent.prototype.hasProperty = function(name) {
        return this.batchTableResources.hasProperty(name);
    };

    /**
     * Part of the {@link Cesium3DTileContent} interface.
     */
    Instanced3DModel3DTileContent.prototype.getFeature = function(batchId) {
        var featuresLength = this._modelInstanceCollection.length;
        //>>includeStart('debug', pragmas.debug);
        if (!defined(batchId) || (batchId < 0) || (batchId >= featuresLength)) {
            throw new DeveloperError('batchId is required and between zero and featuresLength - 1 (' + (featuresLength - 1) + ').');
        }
        //>>includeEnd('debug');

        createFeatures(this);
        return this._features[batchId];
    };

    var sizeOfUint16 = Uint16Array.BYTES_PER_ELEMENT;
    var sizeOfUint32 = Uint32Array.BYTES_PER_ELEMENT;
    var sizeOfFloat64 = Float64Array.BYTES_PER_ELEMENT;

    /**
     * Part of the {@link Cesium3DTileContent} interface.
     */
    Instanced3DModel3DTileContent.prototype.request = function() {
        var that = this;

        var distance = this._tile.distanceToCamera;
        var promise = RequestScheduler.schedule(new Request({
            url : this._url,
            server : this._tile.requestServer,
            requestFunction : loadArrayBuffer,
            type : RequestType.TILES3D,
            distance : distance
        }));
        if (defined(promise)) {
            this.state = Cesium3DTileContentState.LOADING;
            promise.then(function(arrayBuffer) {
                if (that.isDestroyed()) {
                    return when.reject('tileset is destroyed');
                }
                that.initialize(arrayBuffer);
            }).otherwise(function(error) {
                that.state = Cesium3DTileContentState.FAILED;
                that.readyPromise.reject(error);
            });
        }
    };

    /**
     * Part of the {@link Cesium3DTileContent} interface.
     */
    Instanced3DModel3DTileContent.prototype.initialize = function(arrayBuffer, byteOffset) {
        byteOffset = defaultValue(byteOffset, 0);

        var uint8Array = new Uint8Array(arrayBuffer);
        var magic = getMagic(uint8Array, byteOffset);
        if (magic !== 'i3dm') {
            throw new DeveloperError('Invalid Instanced 3D Model. Expected magic=i3dm. Read magic=' + magic);
        }

        var view = new DataView(arrayBuffer);
        byteOffset += sizeOfUint32;  // Skip magic number

        //>>includeStart('debug', pragmas.debug);
        var version = view.getUint32(byteOffset, true);
        if (version !== 1) {
            throw new DeveloperError('Only Instanced 3D Model version 1 is supported. Version ' + version + ' is not.');
        }
        //>>includeEnd('debug');
        byteOffset += sizeOfUint32;

        // Skip byteLength
        byteOffset += sizeOfUint32;

        var batchTableByteLength = view.getUint32(byteOffset, true);
        byteOffset += sizeOfUint32;

        //>>includeStart('debug', pragmas.debug);
        var gltfByteLength = view.getUint32(byteOffset, true);
        if (gltfByteLength === 0) {
            throw new DeveloperError('glTF byte length is zero, i3dm must have a glTF to instance.');
        }
        //>>includeEnd('debug');
        byteOffset += sizeOfUint32;
        
        //>>includeStart('debug', pragmas.debug);
        var gltfFormat = view.getUint32(byteOffset, true);
        if (gltfFormat  !== 1 && gltfFormat  !== 0) {
            throw new DeveloperError('Only glTF format 0 (uri) or 1 (embedded) are supported. Format ' + gltfFormat + ' is not.');
        }
        //>>includeEnd('debug');
        byteOffset += sizeOfUint32;

        var instancesLength = view.getUint32(byteOffset, true);
        byteOffset += sizeOfUint32;

        // Get translation for quantized coordinates
        var translateX = view.getFloat64(byteOffset, true);
        byteOffset += sizeOfFloat64;
        var translateY = view.getFloat64(byteOffset, true);
        byteOffset += sizeOfFloat64;
        var translateZ = view.getFloat64(byteOffset, true);
        byteOffset += sizeOfFloat64;

        // Get scaling for quantized coordinates
        var scaleX = view.getFloat64(byteOffset, true);
        byteOffset += sizeOfFloat64;
        var scaleY = view.getFloat64(byteOffset, true);
        byteOffset += sizeOfFloat64;
        var scaleZ = view.getFloat64(byteOffset, true);
        byteOffset += sizeOfFloat64;

        //>>includeStart('debug', pragmas.debug);
        if ((gltfFormat !== 0) && (gltfFormat !== 1)) {
            throw new DeveloperError('Only glTF format 0 (uri) or 1 (embedded) are supported. Format ' + gltfFormat + ' is not');
        }
        //>>includeEnd('debug');

        var batchTableResources = new Cesium3DTileBatchTableResources(this, instancesLength);
        this.batchTableResources = batchTableResources;
        var hasBatchTable = false;
        if (batchTableByteLength > 0) {
            hasBatchTable = true;
            var batchTableString = getStringFromTypedArray(uint8Array, byteOffset, batchTableByteLength);
            batchTableResources.batchTable = JSON.parse(batchTableString);
            byteOffset += batchTableByteLength;
        }

        var gltfView = new Uint8Array(arrayBuffer, byteOffset, gltfByteLength);
        byteOffset += gltfByteLength;

        // Each vertex has:
        // position : x, y, z in quantized coordinates : 3 * uint16
        // normals  : 2 oct-encoded orthonormal basis vectors for orientation : 2 * (2 * uint)
        // batchId  : optional batchId if there is a batch table present : uint16
        var instanceByteLength = (sizeOfUint16 * 3) + (2 * 2) + (hasBatchTable ? sizeOfUint16 : 0);
        var instancesByteLength = instancesLength * instanceByteLength;

        var instancesView = new DataView(arrayBuffer, byteOffset, instancesByteLength);
        byteOffset += instancesByteLength;

        // Create model instance collection
        var collectionOptions = {
            instances : new Array(instancesLength),
            batchTableResources : batchTableResources,
            boundingVolume : this._tile.contentBoundingVolume.boundingVolume,
            cull : false,
            url : undefined,
            headers : undefined,
            type : RequestType.TILES3D,
            gltf : undefined,
            basePath : undefined
        };

        if (gltfFormat === 0) {
            var gltfUrl = getStringFromTypedArray(gltfView);
            collectionOptions.url = joinUrls(this._tileset.baseUrl, gltfUrl);
        } else {
            collectionOptions.gltf = gltfView;
            collectionOptions.basePath = this._url;
        }

        var instances = collectionOptions.instances;
        byteOffset = 0;

        var translation = new Cartesian3();
        var normalUp = new Cartesian3();
        var normalRight = new Cartesian3();
        var normalOut = new Cartesian3();
        var rotation = new Matrix3();
        for (var i = 0; i < instancesLength; ++i) {
            // Get and decode x, y, z
            translation.x = instancesView.getUint16(byteOffset, true) * scaleX + translateX;
            byteOffset += sizeOfUint16;
            translation.y = instancesView.getUint16(byteOffset, true) * scaleY + translateY;
            byteOffset += sizeOfUint16;
            translation.z = instancesView.getUint16(byteOffset, true) * scaleZ + translateZ;
            byteOffset += sizeOfUint16;

            // Get encoded orientation vectors
            var normalOneX = instancesView.getUint8(byteOffset);
            byteOffset ++;
            var normalOneY = instancesView.getUint8(byteOffset);
            byteOffset ++;
            var normalTwoX = instancesView.getUint8(byteOffset);
            byteOffset ++;
            var normalTwoY = instancesView.getUint8(byteOffset);
            byteOffset ++;

            // Decode compressed normals
            AttributeCompression.octDecode(normalOneX, normalOneY, normalUp);
            AttributeCompression.octDecode(normalTwoX, normalTwoY, normalRight);

            // Compute third normal
            Cartesian3.cross(normalRight, normalUp, normalOut);

            // Place the basis into the rotation matrix
            Matrix3.setColumn(rotation, 0, normalRight, rotation);
            Matrix3.setColumn(rotation, 1, normalUp, rotation);
            Matrix3.setColumn(rotation, 2, normalOut, rotation);

            // Get batch id. If there is no batch table, the batch id is the array index.
            var batchId = i;
            if (hasBatchTable) {
                batchId = instancesView.getUint16(byteOffset, true);
                byteOffset += sizeOfUint16;
            }

            // Make instance with model matrix
            var modelMatrix = Matrix4.fromRotationTranslation(rotation, translation);
            instances[i] = {
                modelMatrix : modelMatrix,
                batchId : batchId
            };
        }

        var modelInstanceCollection = new ModelInstanceCollection(collectionOptions);
        this._modelInstanceCollection = modelInstanceCollection;
        this.state = Cesium3DTileContentState.PROCESSING;
        this.contentReadyToProcessPromise.resolve(this);

        var that = this;

        when(modelInstanceCollection.readyPromise).then(function(modelInstanceCollection) {
            that.state = Cesium3DTileContentState.READY;
            that.readyPromise.resolve(that);
        }).otherwise(function(error) {
            that.state = Cesium3DTileContentState.FAILED;
            that.readyPromise.reject(error);
        });
    };

    /**
     * Part of the {@link Cesium3DTileContent} interface.
     */
    Instanced3DModel3DTileContent.prototype.applyDebugSettings = function(enabled, color) {
        color = enabled ? color : Color.WHITE;
        this.batchTableResources.setAllColor(color);
    };

    /**
     * Part of the {@link Cesium3DTileContent} interface.
     */
    Instanced3DModel3DTileContent.prototype.update = function(tileset, frameState) {
        var oldAddCommand = frameState.addCommand;
        if (frameState.passes.render) {
            frameState.addCommand = this.batchTableResources.getAddCommand();
        }

        // In the PROCESSING state we may be calling update() to move forward
        // the content's resource loading.  In the READY state, it will
        // actually generate commands.
        this.batchTableResources.update(tileset, frameState);
        this._modelInstanceCollection.update(frameState);

        frameState.addCommand = oldAddCommand;
    };

    /**
     * Part of the {@link Cesium3DTileContent} interface.
     */
    Instanced3DModel3DTileContent.prototype.isDestroyed = function() {
        return false;
    };

    /**
     * Part of the {@link Cesium3DTileContent} interface.
     */
    Instanced3DModel3DTileContent.prototype.destroy = function() {
        this._modelInstanceCollection = this._modelInstanceCollection && this._modelInstanceCollection.destroy();
        this.batchTableResources = this.batchTableResources && this.batchTableResources.destroy();

        return destroyObject(this);
    };
    return Instanced3DModel3DTileContent;
});
