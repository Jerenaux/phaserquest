echo 'Applying map changes...'
cd js/server
node -e 'require("./format").format()'
cd ../../
docker-compose down
docker-compose build
docker-compose up -d
echo 'Done.'