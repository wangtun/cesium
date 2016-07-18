/*global define*/
define([
        '../Core/defaultValue',
        '../Core/defined',
        '../Core/DeveloperError',
        '../Renderer/WebGLConstants'
    ], function(
        defaultValue,
        defined,
        DeveloperError,
        WebGLConstants) {
    'use strict';

    /**
     * @private
     */
    function Cesium3DTileFeatureTableResources(featureTableJSON, featureTableBinary) {
        this.json = featureTableJSON;
        this.binaryDataView = new DataView(featureTableBinary);
        this._cachedProperties = {};
    }

    Cesium3DTileFeatureTableResources.prototype.getGlobalProperty = function(semantic, componentType, count) {
        if (defined(this._cachedProperties[semantic])) {
            return this._cachedProperties[semantic];
        } else {
            var jsonValue = this.json[semantic];
            if (defined(jsonValue)) {
                var result;
                if (defined(jsonValue.byteOffset)) {
                    //>>includeStart('debug', pragmas.debug);
                    if (!defined(componentType)) {
                        throw new DeveloperError('componentType must be defined to read from binary data for semantic: ' + semantic);
                    }
                    //>>includeEnd('debug');
                    var byteOffset = jsonValue.byteOffset;
                    // This is a reference to the binary
                    count = defaultValue(count, 1);
                    if (count > 1) {
                        result = [];
                        var componentByteLength = byteLengthForComponentType(componentType);
                        for (var i = 0; i < count; i++) {
                            result.push(readComponentTypeFromDataView(this.binaryDataView, componentType, byteOffset));
                            byteOffset += componentByteLength;
                        }
                    } else {
                        result = readComponentTypeFromDataView(this.binaryDataView, componentType, byteOffset);
                    }
                } else {
                    result = jsonValue;
                }
                this._cachedProperties[semantic] = result;
            }
        }
        return undefined;
    };

    Cesium3DTileFeatureTableResources.prototype.getProperty = function(semantic, featureId, componentType, count) {
        var propertyArray = this.getGlobalProperty(semantic, componentType, count);
        if (defined(propertyArray)) {
            return propertyArray[featureId];
        }
        return undefined;
    };

    function readComponentTypeFromDataView(dataView, componentType, byteOffset) {
        switch(componentType) {
            case WebGLConstants.UNSIGNED_SHORT:
                return dataView.readUInt16LE(byteOffset);
            case WebGLConstants.UNSIGNED_INT:
                return dataView.readUInt32LE(byteOffset);
            case WebGLConstants.FLOAT:
                return dataView.readFloatLE(byteOffset);
        }
    }

    function byteLengthForComponentType(componentType) {
        switch(componentType) {
            case WebGLConstants.UNSIGNED_SHORT:
                return 2;
            case WebGLConstants.UNSIGNED_INT:
            case WebGLConstants.FLOAT:
                return 4;
        }
    }
});