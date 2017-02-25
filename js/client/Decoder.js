/**
 * Created by Jerome on 13-01-17.
 */

// This class is used to decode a binary encoded update package
var Decoder = {};

Decoder.decode = function(data,schema){
    // data is the binary object to decode
    // schema is the template of what to decode ; it indicates the names and types of the fields of the object, allowing to guide the decoding
    var res = Decoder.decodeObject(data,0,schema);
    return res.object;
};

Decoder.countFields = function(schema){
    // Returns the total number of fields in the schema (regardless of being present in the object to decode or not)
    // This information is needed to properly read the properties mask, to know by how much to shif it (see isMaskTrue() )
    var nbFields = 0;
    if(schema.numerical !== undefined) nbFields += Object.keys(schema.numerical).length;
    if(schema.arrays !== undefined) nbFields += Object.keys(schema.arrays).length; // fields that are arrays of objects
    if(schema.maps !== undefined) nbFields += Object.keys(schema.maps).length; // fields that are maps of id -> objects
    if(schema.standAlone !== undefined) nbFields += Object.keys(schema.standAlone).length; // fields that are standalone objects (not in array or map)
    if(schema.strings !== undefined) nbFields += schema.strings.length;
    if(schema.booleans !== undefined) nbFields += schema.booleans.length;
    return nbFields;
};

Decoder.decodeObject = function(pkg,offset,schema){
    // pkg is the binary package to decode
    // offset is the offset, in bytes, at which the decoding has to start (recursive calls of decodeObject() work on the same bit sequence, but at different offsets)
    // on the first call the offset starts at 0, and is incremented each type bytes are read
    // schema is the template to use for the decoding
    var dv = new DataView(pkg);
    var object = {};

    /*
     * Read order :
     * - The mask that indicates what fields from the schema are present in the object
     * - The numerical fields
     * - The length of the string fields and the fields themselves
     * - The length of arrays of sub-objects and the arrays themselves
     * - The standalones
     * - The booleans
     * */

    /* Recursive calls are used to decode nested objects ; they keep reading the same buffer at a different offset. No need to specify and end point, because the nested object
     * will be parsed according to the provided schema, thus only considering the relevan part of the rest of the buffer and effectively returning one the schema is exhausted.*/

    var nbProperties = Decoder.countFields(schema);
    // schema.propertiesBytes indicates how many bytes are required to make a mask for all the possible properties of the schema
    var propertiesMask = dv['getUint'+(schema.propertiesBytes*8)](offset); // series of bits indicating the presence or absence of each field of the schema
    offset+=schema.propertiesBytes;
    var idx = 1; // index of the next field that will be checked, use to shift the properties mask correctly in isMaskTrue()

    if(schema.numerical) {
        Object.keys(schema.numerical).forEach(function (key) {
            if(Decoder.isMaskTrue(propertiesMask,nbProperties,idx)) { // check the properties mask to see if the field is present in the object or not, and therefore has to be decoded or skipped
                var nbBytes = schema.numerical[key];
                object[key] = dv['getUint' + (nbBytes * 8)](offset); // calls e.g. dv.getUint8, dv.getUint16 ... depending on how many bytes are indicated as necessary for the given field in the schema
                offset += nbBytes;
            }
            idx++;
        });
    }

    if(schema.strings) {
        schema.strings.forEach(function (key) {
            if(Decoder.isMaskTrue(propertiesMask,nbProperties,idx)) {
                // Same process as for the numerical fields, but need to decode one additional byte to know the length of each string
                var length = dv.getUint8(offset);
                offset++;
                //console.log("Decoding "+key+" at offset "+offset);
                object[key] = Decoder.decodeString(dv, length, offset);
                offset += (length * CoDec.bytesPerChar); // CoDec.bytesPerChar indicates how many bytes should be allocated to encode one character in a string
            }
            idx++;
        });
    }

    if(schema.arrays) {
        // Iterate over all lists of objetcs
        Object.keys(schema.arrays).forEach(function(arrayOfObjects) {
            // For each list, iterate over the its content
            if(Decoder.isMaskTrue(propertiesMask,nbProperties,idx)) {
                var length = dv.getUint8(offset); // Number of objects in the array (length of the array)
                offset++;
                if(length) {
                    object[arrayOfObjects] = [];
                    var sc = schema.arrays[arrayOfObjects]; // schema of the objects in the list
                    for (var i = 0; i < length; i++) {
                        //console.log("Decoding "+arrayOfObjects+" element at offset "+offset);
                        var result;
                        if(sc.primitive){ // is the object a "primitive" one (primitive flag set to true), decode it as the corresponding type, only ints covered here
                            if(sc.type == 'int') {
                                result = dv['getUint' + (sc.bytes * 8)](offset);
                                offset += sc.bytes;
                            }
                        }else { // otherwise, recursive call to decodeObject() to decode the object in the list
                            var res = Decoder.decodeObject(pkg, offset, sc);
                            result = res.object;
                            offset = res.offset;
                        }
                        object[arrayOfObjects].push(result);
                    }
                }
            }
            idx++;
        });
    }

    if(schema.maps){
        Object.keys(schema.maps).forEach(function(map) {
            if(Decoder.isMaskTrue(propertiesMask,nbProperties,idx)) {
                var length = dv.getUint8(offset); // Number of entries in the map
                offset++;
                if(length) {
                    object[map] = {};
                    for (var i = 0; i < length; i++) {
                        var id = dv['getUint'+(CoDec.bytesPerID*8)](offset); // ID of the entry (= key)
                        offset+=CoDec.bytesPerID;
                        //console.log("Decoding "+map+" element at offset "+offset);
                        var res = Decoder.decodeObject(pkg, offset, schema.maps[map]);
                        object[map][id] = res.object;
                        offset = res.offset;
                    }
                }
            }
            idx++;
        });
    }

    if(schema.standAlone){
        Object.keys(schema.standAlone).forEach(function (objName) {
            if(Decoder.isMaskTrue(propertiesMask,nbProperties,idx)) {
                //console.log('Decoding '+objName+' at offset '+offset);
                var res = Decoder.decodeObject(pkg, offset, schema.standAlone[objName]);
                object[objName] = res.object;
                offset = res.offset;
            }
            idx++
        });
    }

    if(schema.booleans){
        //console.log('Decoding bools at offset '+offset);
        var bools = dv['getUint'+(CoDec.booleanBytes*8)](offset); // just like propertiesMask, bools is a mask indicating the presence/absence of each boolean
        var boolidx = 1; // index of the next boolean to decode
        offset+=CoDec.booleanBytes;
        schema.booleans.forEach(function (key) {
            if(Decoder.isMaskTrue(propertiesMask,nbProperties,idx)) object[key] = !!Decoder.isMaskTrue(bools,schema.booleans.length,boolidx); // !! converts to boolean
            idx++;
            boolidx++;
        });
    }
    return {object:object,offset:offset};
};

Decoder.isMaskTrue = function(mask,nbProperties,idx){ // Process a bitmask to know if a specific field, at index idx, is present or not
    return (mask >> (nbProperties-idx)) & 1; // Shift right to put the target at position 0, and AND it with 1
};

Decoder.decodeString = function(view,length,offset) { // Read length bytes starting at a specific offset to decode a string
    var chars = [];
    for(var i = 0; i < length; i++){
        chars.push(String.fromCharCode(view['getUint'+(CoDec.bytesPerChar*8)](offset)));
        offset += CoDec.bytesPerChar;
    }
    return chars.join('');
};