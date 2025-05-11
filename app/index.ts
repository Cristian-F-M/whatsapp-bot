import { Client, LocalAuth } from 'whatsapp-web.js'
import type { Message, MessageMedia } from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import fs from 'node:fs'
import cron from 'node-cron'

const { REELS_FROM_NUMBER } = process.env

const reelsStatus = {
	reelsCount: 0,
	maxReels: 5,
}

const messages = [
	'Ya te he dicho mil veces que no se pueden enviar más de 5 reels. ¿Es que no entiendes?',
	'Esto ya está fuera de control. ¡Basta de enviar esos malditos reels!',
	'¿Acaso soy tu cartero? Deja de enviar reels, ya es demasiado.',
	'¡Cálmate y entiende de una vez por todas! Si sigues enviando reels, te vas a arrepentir.',
	'Te lo estoy advirtiendo por última vez: Si sigues con esos malditos reels, no tendré otro remedio que bloquearte de una vez.',
]

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
	console.log(qr)
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
	}
})

client.on('message', async (msg) => {
	const { from } = msg

	if (from !== `${REELS_FROM_NUMBER}@c.us`) return
	const isReel = await getIsReel(msg)
	const isReelToday = isMessageToday(msg)

	if (!isReel || !isReelToday) return
	if (reelsStatus.reelsCount >= reelsStatus.maxReels) {
		const messageIndex = reelsStatus.reelsCount - reelsStatus.maxReels
		const messageToSend = messages[messageIndex]
		msg.reply(messageToSend)
		return
	}
	reelsStatus.reelsCount += 1

	const chat = await msg.getChat()
	client.sendMessage(
		chat.id._serialized,
		`Reels: ${reelsStatus.reelsCount}/${reelsStatus.maxReels}`,
	)
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
	} catch {}

	if (!number) return
	const chat = await msg.getChat()
	reelsStatus.reelsCount = number
	client.sendMessage(
		chat.id._serialized,
		`${reelsStatus.reelsCount}/${reelsStatus.maxReels}`,
	)
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

async function initTempDir() {
	if (!fs.existsSync('temp/')) {
		fs.mkdirSync('temp/')
	}
}

async function getIsReel(msg: Message) {
	const regex = /(https:\/\/)?(www.)?(facebook|instagram).com\/(reel|share)\/.+/

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
