import express from 'express'
import http from 'node:http'
import { Server } from 'socket.io'
import path from 'node:path'
import { STATUS } from './index'

export function server() {
	const app = express()

	app.get('/', async (req, res) => {
		res.sendFile(path.join(__dirname, 'public', 'index.html'))
	})

	app.use(express.static(path.join(__dirname, 'public')))

	console.log(path.join(__dirname, 'public'))

	const port = 8081

	const server = http.createServer(app)
	const io = new Server(server)

	io.on('connection', (socket) => {
		io.emit('status', STATUS)
	})

	server.listen(port, () => {
		console.log(`App is listening on http://localhost:${port}/`)
	})

	return { app, server, socket: io }
}
