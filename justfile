set dotenv-load := true

# Access PR Review database for inspection
access-database:
    docker exec -it pr_review_agent_database mysql -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" $MYSQL_DATABASE
