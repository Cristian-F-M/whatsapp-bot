import { Client, LocalAuth, MessageMedia, type Message } from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import ffmpeg, { type FfprobeData } from 'fluent-ffmpeg'
import path from 'node:path'
import fs from 'node:fs'
import cron from 'node-cron'

const { REELS_FROM_NUMBER } = process.env

const reelsStatus = {
	reelsCount: 0,
	maxReels: 5,
}

cron.schedule(
	'0 0 * * *',
	() => {
		reelsStatus.reelsCount = 0
	},
	{
		timezone: 'America/Bogota',
	},
)

initTempDir()

const client = new Client({
	authStrategy: new LocalAuth(),
	puppeteer: {
		headless: true,
	},
})

client.on('qr', (qr) => {
	qrcode.generate(qr, { small: true })
})

client.on('ready', async () => {
	console.log('Bot listo!')
})

client.on('message_create', async (msg) => {
	if (!msg.body.startsWith('!sticker')) return

	if (!msg.hasMedia) return msg.reply('Envía una imagen alcornoque. 😡')

	const media = await msg.downloadMedia()

	if (media.mimetype.startsWith('image')) {
		imageToSticker(msg, media)
	}

	if (media.mimetype.startsWith('video')) {
		return msg.reply('⚠️ Esta mrd no funciona, so, deshabilitada ⚠️')
		// videoToSticker(msg, media)
	}
})

client.on('message', async (msg) => {
	const { from } = msg

	if (from !== `${REELS_FROM_NUMBER}@c.us`) return

	const isReel = await getIsReel(msg)
	if (isReel) {
		if (reelsStatus.reelsCount >= reelsStatus.maxReels) {
			msg.reply('🙂 Maximo de reels 🙂')
		}
		reelsStatus.reelsCount += 1

		const chat = await msg.getChat()
		const remainingReels = reelsStatus.maxReels - reelsStatus.reelsCount
		client.sendMessage(
			chat.id._serialized,
			`Reels: ${reelsStatus.reelsCount}/${remainingReels}`,
		)
	}
})

client.on('message_create', async (msg) => {
	const { body, fromMe } = msg

	if (!fromMe) return
	if (!body.startsWith('!reels')) return

	const commandSplited = body.split(' ')

	if (commandSplited.length <= 1) return
	const [command, value] = commandSplited

	let number = null

	try {
		number = Number(value)
		number = number > reelsStatus.maxReels ? reelsStatus.maxReels : number
	} catch {}

	if (number) reelsStatus.reelsCount = number
})

client.initialize()

async function imageToSticker(msg: Message, media: MessageMedia) {
	// const imagePath = path.join(
	// 	__dirname,
	// 	`${media.filename}.${media.mimetype}` || '',
	// )

	try {
		await msg.reply(media, undefined, { sendMediaAsSticker: true })
	} catch (err) {
		msg.reply('❌ No se pudo convertir la imagen a sticker')
	} finally {
		// if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath)
	}
}

async function videoToSticker(msg: Message, media: MessageMedia) {
	const inputBuffer = Buffer.from(media.data, 'base64')
	const inputPath = path.join(__dirname, path.join('temp/', 'input.mp4'))
	const outputPath = path.join(__dirname, path.join('temp/', 'sticker.webp'))

	try {
		fs.writeFileSync(inputPath, inputBuffer)
	} catch {
		return msg.reply('❌ Error al convertir a sticker')
	}

	const metadata = await getMetadata(inputPath)

	if (metadata) {
		const { duration } = metadata.streams[0]

		const chat = await msg.getChat()

		if (duration && Number(duration) > 6)
			client.sendMessage(
				chat.id._serialized,
				'Recortando el video a 6 segundos...',
			)
	}

	try {
		const res = await convertToWebp(inputPath, outputPath) // ? Verify this

		if (!res.ok) throw new Error(res.error)
		if (!fs.existsSync(outputPath))
			throw new Error(
				`No se encuentra el archivo para convertir en webp en la path: ${outputPath}`,
			)

		const stickerMedia = MessageMedia.fromFilePath(outputPath)
		msg.reply(stickerMedia, undefined, { sendMediaAsSticker: true })
	} catch (err) {
		console.log('Error:', err)
		msg.reply('❌ Error al convertir a sticker')
	} finally {
		if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath)
	}

	try {
		const stickerMedia = MessageMedia.fromFilePath(outputPath)
		await msg.reply(stickerMedia, undefined, { sendMediaAsSticker: true })
	} catch (error) {
		console.error('Error al enviar el sticker:', error)
	} finally {
		if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
	}
}

async function initTempDir() {
	if (!fs.existsSync('temp/')) {
		fs.mkdirSync('temp/')
	}
}

async function convertToWebp(
	inputPath: string,
	outputPath: string,
): Promise<{ ok: boolean; outputPath: string; error?: string }> {
	return new Promise((resolve, reject) => {
		try {
			ffmpeg(inputPath)
				.outputOptions([
					'-vcodec',
					'webp',
					'-q:v',
					'100',
					'-vf',
					'scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black',
					'-loop',
					'0',
					'-preset',
					'default',
					'-an',
					'-pix_fmt',
					'yuva420p',
				])
				.duration(6)
				.on('end', () => resolve({ ok: true, outputPath }))
				.on('error', (err) => {
					console.log('Error al convertir a webp:', err)
					reject({ ok: false, error: err })
				})
				.save(outputPath)
		} catch (err) {
			console.log('Error inesperado:', err)
			reject({ ok: false, error: err })
		}
	})
}

function convertToWebpResolve(inputPath: string, outputPath: string) {
	const { promise, resolve, reject } = Promise.withResolvers<{
		ok: boolean
		outputPath: string
		error?: string
	}>()

	try {
		ffmpeg(inputPath)
			.outputOptions([
				'-vcodec',
				'webp',
				'-q:v',
				'100',
				'-vf',
				'scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black',
				'-loop',
				'0',
				'-preset',
				'default',
				'-an',
				'-pix_fmt',
				'yuva420p',
			])
			.duration(6)
			.save(outputPath)
		resolve({ ok: true, outputPath })
	} catch (err) {
		reject({
			ok: false,
			error: err,
			outputPath: null,
		})
	}

	return promise
}

function getMetadata(inputPath: string) {
	return new Promise<FfprobeData>((resolve, reject) => {
		try {
			ffmpeg.ffprobe(inputPath, async (err, data) => {
				if (err) return console.log('Error al obtener la metadata:', err)
				resolve(data)
			})
		} catch (err) {
			reject(err)
		}
	})
}

async function getIsReel(msg: Message) {
	const regex = /(https:\/\/)?(www.)*facebook.com\/reel\/.+/

	let { body } = msg

	if (msg.hasQuotedMsg) {
		const quotedMsg = await msg.getQuotedMessage()
		const isToday = isMessageToday(quotedMsg)
		if (!isToday) body = quotedMsg.body
	}

	return regex.test(body)
}

function isMessageToday(msg: Message) {
	const { timestamp } = msg

	const messageDate = new Date(timestamp * 1000)
	const now = new Date()

	const isToday =
		now.getFullYear() === messageDate.getFullYear() &&
		now.getMonth() === messageDate.getMonth() &&
		now.getDate() === messageDate.getDate()

	return isToday
}
