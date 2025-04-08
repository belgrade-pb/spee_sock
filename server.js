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
        filename: 'spee_sock' +
            '.db',
        driver: sqlite3.Database
    });

    await db.exec(`
    CREATE TABLE IF NOT EXISTS shoping_catalog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        status INTEGER
    );
  `);

    await db.exec(`
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        catalog_id INTEGER,
        name TEXT UNIQUE,
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
                console.log(result.lastID)
                callback(result.lastID);
            } catch (e) {
                console.log('error', e);
                if (e.errno === 19 ) {
                    callback();
                } else {
                    // nothing to do, just let the client retry
                }
                return;
            }
            // io.emit('chat message', msg, result.lastID);
            callback();
        });

        socket.on('get_all', async (data, callback) => {
            console.log('get_all');
            callback(testData)
            // try {
            //     await db.all('SELECT * FROM shoping_catalog', {}, (_err, result) => {
            //         // socket.emit('chat message', row.content, row.id);
            //         console.log('_err', _err);
            //         console.log('result', result)
            //         callback(result);
            //     });
            //
            // } catch (e) {
            //     console.log('error', e);
            //     callback();
            // }
            // io.emit('chat message', msg, result.lastID);
            // callback();
        });

        if (!socket.recovered) {
            socket.emit('update', testData);
            // try {
            //     await db.each('SELECT id, content FROM shoping_catalog WHERE id > ?',
            //         [socket.handshake.auth.serverOffset || 0],
            //         (_err, row) => {
            //             socket.emit('chat message', row.content, row.id);
            //         }
            //     )
            // } catch (e) {
            //     // something went wrong
            // }
        }
    });

    const port = process.env.PORT;

    server.listen(port, () => {
        console.log(`server running at http://localhost:${port}`);
    });
}