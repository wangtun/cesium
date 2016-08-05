/*global define*/
define([
        '../Core/ComponentDataType',
        '../Core/defaultValue',
        '../Core/defined',
        '../Core/DeveloperError'
    ], function(
        ComponentDataType,
        defaultValue,
        defined,
        DeveloperError) {
    'use strict';

    /**
     * @private
     */
    function Cesium3DTileFeatureTableResources(featureTableJSON, featureTableBinary) {
        this.json = featureTableJSON;
        this.buffer = featureTableBinary;
        this._cachedArrayBufferViews = {};
        this.featuresLength = 0;
    }

    Cesium3DTileFeatureTableResources.prototype.getTypedArrayForSemantic = function(semantic, byteOffset, componentType, count, featureSize) {
        //>>includeStart('debug', pragmas.debug);
        if (!defined(byteOffset)) {
            throw new DeveloperError('byteOffset must be defined to read from binary data for semantic: ' + semantic);
        }
        if (!defined(componentType)) {
            throw new DeveloperError('componentType must be defined to read from binary data for semantic: ' + semantic);
        }
        if (!defined(count)) {
            throw new DeveloperError('count must be defined to read from binary data for semantic: ' + semantic);
        }
        //>>includeEnd('debug');
        var cachedArrayBufferViews = this._cachedArrayBufferViews;
        var arrayBuffer = cachedArrayBufferViews[semantic];
        if (!defined(arrayBuffer)) {
            arrayBuffer = ComponentDataType.createArrayBufferView(componentType, this.buffer.buffer, this.buffer.byteOffset + byteOffset, count * featureSize);
            cachedArrayBufferViews[semantic] = arrayBuffer;
        }
        return arrayBuffer;
    };

    Cesium3DTileFeatureTableResources.prototype.getGlobalProperty = function(semantic, componentType, count) {
        var jsonValue = this.json[semantic];
        if (defined(jsonValue)) {
            var byteOffset = jsonValue.byteOffset;
            if (defined(byteOffset)) {
                // This is a reference to the binary
                count = defaultValue(count, 1);
                var typedArray = this.getTypedArrayForSemantic(semantic, byteOffset, componentType, count);
                var subArray = typedArray.subarray(0, count);
                if (count === 1) {
                    return subArray[0];
                }
                return subArray;
            }
        }
        return jsonValue;
    };

    Cesium3DTileFeatureTableResources.prototype.getProperty = function(semantic, featureId, componentType, featureSize) {
        var jsonValue = this.json[semantic];
        if (defined(jsonValue)) {
            var byteOffset = jsonValue.byteOffset;
            if (defined(byteOffset)) {
                // This is a reference to the binary
                featureSize = defaultValue(featureSize, 1);
                var typedArray = this.getTypedArrayForSemantic(semantic, byteOffset, componentType, this.featuresLength, featureSize);
                var subArray = typedArray.subarray(featureId * featureSize, featureId * featureSize + featureSize);
                if (featureSize === 1) {
                    return subArray[0];
                }
                return subArray;
            }
        }
        return jsonValue.slice(featureId * featureSize, featureId * featureSize + featureSize);
    };

    return Cesium3DTileFeatureTableResources;
});