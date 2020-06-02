echo 'Building Docker...'
docker-compose build
docker-compose up -d
open https://localhost
echo 'Done.'