const crypto = require("node:crypto");
const dayjs = require("dayjs");
const LocalizedFormat = require("dayjs/plugin/localizedFormat");
dayjs.extend(LocalizedFormat);
const { CronJob } = require("cron");
const { Client, GatewayIntentBits, MessageFlags } = require("discord.js");

const series = require("./series.json");

require("dotenv").config();

const pubKey = process.env.MARVEL_PUB_KEY;
const privKey = process.env.MARVEL_PRIV_KEY;

let jobs = [];

async function scheduleCronJob() {
  for (let job of jobs) {
    job.stop();
  }
  jobs = [];

  let job = new CronJob(
    "0 7 * * *",
    async function () {
      const guild = client.guilds.cache.get(waaGuildId);

      const channelId = process.env.CHANNEL_ID;
      const channel = await guild.channels.fetch(channelId);

      const comics = await getComics();

      for (let comic of comics) {
        const onSaleDate = dayjs(
          comic.dates.find((date) => date.type === "onsaleDate").date
        );

        if (onSaleDate.format("LL") == dayjs().format("LL")) {
          await channel.send({
            content: `${comic.title} is out today`,
          });
        }
      }
    },
    null,
    true,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    { client }
  );

  jobs.push(job);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const guildId = process.env.GUILD_ID;
if (guildId === undefined) {
  console.error("Guild ID environment variable (GUILD_ID) not provided");
  process.exit(1);
}

client.on("ready", async () => {
  console.log("Jeffbot is running");

  await scheduleCronJob();

  const guild = client.guilds.cache.get(guildId);

  if (guild) {
    const commands = guild.commands;

    await commands.create({
      name: "comics_this_week",
      description: "Prints out any comics that have new issues out this week",
    });
  }
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.commandName == "comics_this_week") {
    const comics = await getComics();

    let msg = [];

    if (comics.length > 0) {
      msg.push(`Comics out this week:`);
    } else {
      msg.push(`No comics are out this week`);
    }

    for (let comic of comics) {
      const onSaleDate = dayjs(
        comic.dates.find((date) => date.type === "onsaleDate").date
      );

      msg.push(`${comic.title} is out ${onSaleDate.format("LL")}`);
    }

    interaction.reply({ content: msg.join("\n") });
  }
});

async function getSeries(id, dateDescriptor) {
  const ts = dayjs().unix().toString();
  const hash = crypto.hash("md5", ts + privKey + pubKey);

  const resp = await fetch(
    `https://gateway.marvel.com/v1/public/series/${id}/comics?ts=${ts}&apikey=${pubKey}&hash=${hash}&dateDescriptor=${dateDescriptor}`
  ).then((resp) => resp.json());
  if (resp.data.count > 0) {
    return resp.data.results[0];
  } else {
    console.error("No results for this series this week");
    return null;
  }
}

async function getComics() {
  let comics = [];

  for (let { id } of series) {
    const data = await getSeries(id, "thisWeek");

    if (data != null) {
      comics.push(data);
    }
  }

  return comics;
}

client.login(process.env.JEFFBOT_DISCORD_TOKEN);
