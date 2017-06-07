/**
 * Created by Jerome on 23-08-16.
 */

var fs = require('fs');
var clone = require('clone');

function Layer(w,h,name,level) {
    this.width = w;
    this.height = h;
    this.name = name;
    this.type = "tilelayer";
    this.visible = true;
    this.x = 0;
    this.y = 0;
    this.data = []; // Array of tiles
    this.opacity = 1;
    this.properties = { // stores additional non-standard properties
        level:level // high or ground
    }
}

function tileMap(map,isClient){
    this.height = map.height;
    this.width = map.width;
    this.tilewidth = map.tilewidth;
    this.tileheight = map.tileheight;
    this.layers = [];
    this.tilesets = [map.tilesets[0]]; // for PQ we use only one tileset, the first one of the original two
    if(isClient){ // the following is only useful for the client-side map
        this.orientation = map.orientation; // iso or ortho ; mandatory
        this.properties = map.properties;
    }
}

function formatMap(){
    console.log('Formatting ...');
    var path = '/../../assets/maps/';
    var name = "map";

    // Look by default for map.json in assets/map ; map.json is the exported JSON file from Tiled
    fs.readFile(__dirname+path+name+".json", 'utf8', function (err, data) {
        if (err) throw err;
        var map = JSON.parse(data);
        // Create two map representations, one for client and one for server, and copy a few properties from the initial map object into a new one
        var clientmap = new tileMap(map,true);
        var servermap = new tileMap(map,false);

        // the ground-level layers display below the game entities, the high-level layers display above
        var newLayers = [new Layer(map.width,map.height,"layer0","ground")]; // array of ground-level layers
        var highLayers = [new Layer(map.width,map.height,"highlayer0","high")]; // array of layers appearing above entities
        var clientObjectLayers = [];
        var serverObjectLayers = [];
        // Fill the layers with 0's (empty tiles)
        fillLayer(highLayers[0], map.width * map.height);
        fillLayer(newLayers[0],map.width*map.height);
        for(var i= 0; i < map.layers.length; i++) { // Scan all layers of the original map one by one
            var layer = map.layers[i];
            if (layer.type === "tilelayer") {
                //console.log('processing ' + layer.name);
                for (var j = 0; j < layer.data.length; j++) { // Scan all tiles one by one
                    var tileProperties = map.tilesets[0].tileproperties[layer.data[j]-1];
                    if(tileProperties && tileProperties.hasOwnProperty('v')){ // The original Browserquest map uses the property 'v' to indicate tiles that should be displayed above the player
                        addTile(highLayers,true,j,layer.data[j],map.width,map.height);
                    }else{
                        addTile(newLayers,false,j,layer.data[j],map.width,map.height);
                    }
                }
                //console.log('done with layer ' + layer.name);
            } else if (layer.type === "objectgroup") {
                if(layer.name == 'doors' || layer.name == 'entities') { // Only store doors and entities objects in client map
                    if(layer.name == 'entities'){
                        clientObjectLayers.push(filterEntities(clone(layer)));
                    }else {
                        clientObjectLayers.push(layer);
                    }
                }
                serverObjectLayers.push(layer);
            }
        }

        //countTiles(newLayers);
        //countTiles(highLayers);

        console.log(clientObjectLayers.length+' client object layers');
        console.log(serverObjectLayers.length+' server object layers');
        // Put all layers (objects and tiles) together
        clientmap.layers = newLayers.concat(highLayers).concat(clientObjectLayers);
        servermap.layers = newLayers.concat(highLayers).concat(serverObjectLayers);

        console.log("Initial #layers = "+map.layers.length);
        console.log("New #layers = "+clientmap.layers.length);
        // Write down the newly created files
        fs.writeFile(__dirname+path+'mini'+name+'_client.json',JSON.stringify(clientmap),function(err){
            console.log('Client map written!');
        });
        fs.writeFile(__dirname+path+'mini'+name+'_server.json',JSON.stringify(servermap),function(err){
            console.log('Server map written!');
        });

    });
}

function addTile(layerArray,high,index,tile,w,h){ // Add a tile to the 'bottom-most' possible layer, or create one if necessary
    if(tile == 0) return;
    var depth = 0;
    // Look for the first layer wih an empty tile at the corresponding position (=index)
    while (layerArray[depth].data[index] != 0 && layerArray[depth].data[index] !== undefined) { // If there is already a tile in that position (index) at the current layer depth ...
        depth++; // If non-empty, increase depth = look one layer further ("higher")
        if (depth >= layerArray.length) { // If reached max depth, create new layer
            var name = (high ? "highlayer" : "layer") + depth;
            layerArray.push(new Layer(w,h, name,(high ? "high" : "ground")));
            fillLayer(layerArray[depth], w*h);
        }
    }
    layerArray[depth].data[index] = tile;
}

function countTiles(arr){
    for(var i = 0; i < arr.length; i++){
        var tmp = arr[i].data.slice();
        var nb = tmp.map(function(x){
            return +(x > 0);
        }).reduce(function(a,b){
            return a+b;
        },0);
        console.log(nb+' tiles in layer '+i);
    }
}

/*function findTiles(layer){
    for(var i = 0; i < layer.data.length; i++){
        if(layer.data[i] > 0){
            var x = i%layer.width;
            var y = Math.floor(i/layer.width);
            console.log('tile at '+x+', '+y);
        }
    }
}*/

function fillLayer(layer,n){
    for(var k = 0; k < n; k++){
        layer.data.push(0);
    }
}

function filterEntities(layer){ // Filters out game entities that don't need to be present in the map, based on their ID in the tileset used to represent them
   var tmpobj = [];
    for(var i = 0; i < layer.objects.length; i++){
        var obj = layer.objects[i];
        var gid = obj.gid;
        // gid between 6 and 12 or 18 and 27  (1961 + )
        if((gid >= 1961+6 && gid <= 1961+12) || (gid >= 1961+18 && gid <= 1961+27)){
            tmpobj.push(obj);
        }
    }
    layer.objects = tmpobj;
    return layer;
}

/*function breakMap(map){
    var path = '/../../assets/maps/';
    var AOIwidth = 34; // 6 AOIs horizontally
    var AOIheight = 20; // 16 AOIs vertically
    var nbAOIhoriz = 6;
    var nbAOIvert = 16;
    var mapWidth = map.width;
    var nbAOI = nbAOIhoriz*nbAOIvert;
    var lastID = nbAOI-1;
    lastID = 2;

    for(var aoi = 0; aoi <= lastID; aoi++){
        var subMap = clone(map);
        var x = (aoi%nbAOIhoriz)*AOIwidth;
        var y = Math.floor(aoi/nbAOIhoriz)*AOIheight;
        var liststart = AOIwidth*nbAOIhoriz*y + x;  // At which index in the list corresponds the top left tile of the submap
        //console.log('linetsart : '+liststart);
        for(var i= 0; i < subMap.layers.length; i++) { // Scan all layers one by one
            var layer = subMap.layers[i];
            layer.width = AOIwidth;
            layer.height = AOIheight;
            // TODO : also filter objects
            if (layer.type === "tilelayer") {
                var tmpdata = [];
                //console.log('data length : '+layer.data.length);
                for(var yi = 0; yi < AOIheight; yi++){
                    var begin = liststart + yi*mapWidth;
                    var end = begin+AOIwidth;
                    var line = layer.data.slice(begin,end);
                    tmpdata = tmpdata.concat(line);
                }
                layer.data = tmpdata;
                //console.log('new data length : '+layer.data.length);
            }
        }
        fs.writeFile(__dirname+path+'pieces/piece'+aoi+'.json',JSON.stringify(subMap),function(err){
            //console.log('Piece written');
        });
    }
}*/

module.exports.format = formatMap;

