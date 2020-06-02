### Running locally

- provide web socket local url in `js/client/client.js`:

```diff
- Client.socket = io.connect();
+ Client.socket = io.connect('http://localhost:8081');
```

- run mongodb:

```
npm run start:db
```

- run server:

```
npm start
```

- run clinet:

```
npm run client:dev
```

### Edting the map

- open `assets/maps/phaserquest_map.tmx` in Tiles-1.1.6
- edit the map and export as json to `assets/maps/map.json`
- format json map:

```
npm run map:format
```

### Running Docker

Run:

```
npm run docker:build:run
```

To apply map changes once exported to `assets/maps/map.json`, run:

```
npm run docker:restart:map
```