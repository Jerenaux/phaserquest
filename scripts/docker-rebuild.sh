echo 'Rebuilding Docker...'
docker-compose down
docker-compose build
docker-compose up -d
echo 'Done.'