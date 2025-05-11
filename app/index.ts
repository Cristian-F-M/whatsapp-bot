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
	'¿Eres imbécil o qué? ¡Ya te dije que no mandes más de 5 reels, pedazo de subnormal!',
	'¡Me cago en todo, basta ya de tus putos reels de mierda! ¿No tienes nada mejor que hacer, gilipollas?',
	'¿Te crees que soy tu puto esclavo? ¡Deja de enviarme esta basura o te reviento, inútil!',
	'¡Que te den por el culo, capullo! Otro reel más y te juro que te arrepentirás de haber nacido.',
	'Último aviso, hijo de puta: Si me llega UN MALDITO REEL MÁS, te bloqueo y te mando a la mierda para siempre, retrasado mental.',
	'¡LA CONCHA DE TU MADRE, IMBÉCIL! ¿TAN DIFÍCIL ES ENTENDER QUE NO QUIERO TUS REELS DE MIERDA? ¡CHÚPAME LA PORONGA, IGNORANTE DE MIERDA!',
	'¡NI UN REEL MÁS, CABRÓN! SI VUELVES A MANDAR ALGO, TE JURO QUE TE VOY A BUSCAR Y TE VOY A REVENTAR LA CARA, PEDAZO DE ESCORIA INMUNDA.',
]

const messageLastIndex = messages.length - 1

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
		const index = reelsStatus.reelsCount - reelsStatus.maxReels + 1
		const messageIndex = index > messageLastIndex ? messageLastIndex : index
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
	const messageSent = await client.sendMessage(
		chat.id._serialized,
		`${reelsStatus.reelsCount}/${reelsStatus.maxReels}`,
	)
	const index = reelsStatus.reelsCount - reelsStatus.maxReels
	const messageIndex = index > messageLastIndex ? messageLastIndex : index
	const messageToSend = messages[messageIndex]
	messageSent.reply(messageToSend)
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
