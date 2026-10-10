"use strict";

var dbm;
var type;
var seed;

/**
 * We receive the dbmigrate dependency from dbmigrate initially.
 * This enables us to not have to rely on NODE_PATH.
 */
exports.setup = function (options, seedLink) {
    dbm = options.dbmigrate;
    type = dbm.dataType;
    seed = seedLink;
};

exports.up = function (db) {
    return db.runSql(`
        CREATE TABLE IF NOT EXISTS reviews (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            repo VARCHAR(255) NOT NULL,
            owner VARCHAR(255) NOT NULL,
            pr_number INT UNSIGNED NOT NULL,
            head_sha VARCHAR(64) NOT NULL,
            delivery_id VARCHAR(64) NOT NULL,
            status VARCHAR(32) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

            UNIQUE KEY uq_reviews_delivery (delivery_id),
            KEY idx_reviews_pr (owner, repo, pr_number)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
};

exports.down = function (db) {
    return db.runSql("DROP TABLE IF EXISTS reviews");
};

exports._meta = {
    version: 1,
};
