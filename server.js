import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Server } from 'socket.io';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { availableParallelism } from 'node:os';
import cluster from 'node:cluster';
import { createAdapter, setupPrimary } from '@socket.io/cluster-adapter';

if (cluster.isPrimary) {
    const numCPUs = availableParallelism();
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork({
            PORT: 3000 + i
        });
    }

    setupPrimary();
} else {
    const db = await open({
        filename: 'spee_sock.db',
        driver: sqlite3.Database
    });

    await db.exec(`
    CREATE TABLE IF NOT EXISTS shoping_catalog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        status INTEGER
    );
  `);

    await db.exec(`
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        catalog_id INTEGER,
        name TEXT,
        status INTEGER
    );
  `);

    const testData = {
        data:[
            {id:1, name:'catalog 1', products:[
                    {id:1, name:'product 1', status:1, parrent_id:1},
                    {id:2, name:'product 2', status:1, parrent_id:1},
                    {id:3, name:'product 3', status:1, parrent_id:1},
                ]
            },
            {id:2, name:'catalog 2', products:[
                    {id:4, name:'product 4', status:1, parrent_id:2},
                    {id:5, name:'product 5', status:1, parrent_id:2},
                    {id:6, name:'product 6', status:1, parrent_id:2},
                ]
            },
            {id:3, name:'catalog 3', products:[
                    {id:7, name:'product 7', status:1, parrent_id:3},
                    {id:8, name:'product 8', status:1, parrent_id:3},
                    {id:9, name:'product 9', status:1, parrent_id:3},
                ]
            }
        ]
    }
    const app = express();
    const server = createServer(app);
    const io = new Server(server, {
        connectionStateRecovery: {},
        adapter: createAdapter()
    });

    const __dirname = dirname(fileURLToPath(import.meta.url));

    app.get('/', (req, res) => {
        res.sendFile(join(__dirname, 'index.html'));
    });

    app.get('/testui', (req, res) => {
        res.sendFile(join(__dirname, 'test.html'));
    });

    io.on('connection', async (socket) => {
        socket.on('add_catalog', async (data, callback) => {
            console.log('add_catalog');
            try {
                let result = await db.run('INSERT INTO shoping_catalog (name, status) VALUES (?, ?)', data.name, 1);
                callback();
                sendUpdate(socket);
            } catch (e) {
                console.log('error', e);
            }
            callback();
        });

        socket.on('add_product', async (data, callback) => {
            console.log('add_product');
            try {
                let result = await db.run('INSERT INTO products (name, catalog_id, status) VALUES (?, ?, ?)', data.name, data.catalogId, 1);
                callback();
                sendUpdate(socket);
            } catch (e) {
                console.log('error', e);
            }
            callback();
        });

        socket.on('update_product', async (data, callback) => {
            console.log('update_product');
            try {
                let result = await db.run('UPDATE products SET name = ? WHERE id = ?', data.name, data.id);
                callback(result.lastID);
                sendUpdate(socket);
            } catch (e) {
                console.log('error', e);
            }
            callback();
        });

        socket.on('update_catalog', async (data, callback) => {
            console.log('update_catalog');
            try {
                let result = await db.run('UPDATE shoping_catalog SET name = ? WHERE id = ?', data.name, data.id);
                callback(result.lastID);
                sendUpdate(socket);
            } catch (e) {
                console.log('error', e);
            }
            callback();
        });

        if (!socket.recovered) {
            sendUpdate(socket);
        }
    });

    async function sendUpdate(socket) {
        try {
            let res = await db.all('SELECT * FROM shoping_catalog');
            for (let i = 0; i < res.length; i++) {
                let products = await db.all('SELECT * FROM products WHERE catalog_id = ?', res[i].id);
                res[i].products = products;
            }
            socket.emit('update', res);
        } catch (e) {
            console.log('error', e);
        }
    }

    const port = process.env.PORT;

    server.listen(port, () => {
        console.log(`server running at http://localhost:${port}`);
    });
}