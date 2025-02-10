const crypto = require("node:crypto");
const dayjs = require("dayjs");
const LocalizedFormat = require("dayjs/plugin/localizedFormat");
dayjs.extend(LocalizedFormat);
const { CronJob } = require("cron");
const {
  Client,
  GatewayIntentBits,
  MessageFlags,
  ApplicationCommandOptionType,
} = require("discord.js");
const fs = require("fs");

let series = require("./series.json");

require("dotenv").config();

const pubKey = process.env.MARVEL_PUB_KEY;
const privKey = process.env.MARVEL_PRIV_KEY;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const guildId = process.env.GUILD_ID;
if (guildId === undefined) {
  console.error("Guild ID environment variable (GUILD_ID) not provided");
  process.exit(1);
}

let jobs = [];

async function scheduleCronJob() {
  for (let job of jobs) {
    job.stop();
  }
  jobs = [];

  let job = new CronJob(
    "0 7 * * *",
    async function () {
      const guild = client.guilds.cache.get(guildId);

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
    await commands.create({
      name: "print_series",
      description: "Prints out any comics that we are tracking",
    });
    await commands.create({
      name: "add_series",
      description: "Adds a new series to check for updates",
      options: [
        {
          name: "series_id",
          description: "The ID of the series to add",
          type: ApplicationCommandOptionType.String,
          required: true,
        },
        {
          name: "series_name",
          description: "The name of the series to add",
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    });
    await commands.create({
      name: "remove_series",
      description: "Removes a series from the list",
      options: [
        {
          name: "series_id",
          description: "The ID of the series to remove",
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    });
  }
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.commandName == "comics_this_week") {
    await interaction.deferReply();
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

    interaction.editReply({ content: msg.join("\n") });
  } else if (interaction.commandName == "print_series") {
    const msg = printSeriesList();
    interaction.reply({ content: msg });
  } else if (interaction.commandName == "add_series") {
    const seriesId = interaction.options.getString("series_id");
    const seriesName = interaction.options.getString("series_name");

    addSeries(parseInt(seriesId), seriesName);

    interaction.reply({
      content: `Added series ${seriesName} with id ${seriesId}`,
    });
  } else if (interaction.commandName == "remove_series") {
    const seriesId = interaction.options.getString("series_id");

    removeSeries(parseInt(seriesId));

    interaction.reply({
      content: `Removed series with id ${seriesId}`,
    });
  }
});

async function getSeries(id, name, dateDescriptor) {
  const ts = dayjs().unix().toString();
  const hash = crypto.hash("md5", ts + privKey + pubKey);

  const resp = await fetch(
    `https://gateway.marvel.com/v1/public/series/${id}/comics?ts=${ts}&apikey=${pubKey}&hash=${hash}&dateDescriptor=${dateDescriptor}`
  ).then((resp) => resp.json());
  if (resp.data.count > 0) {
    return resp.data.results[0];
  } else {
    console.error("No results this week for series: " + name);
    return null;
  }
}

async function getComics() {
  let comics = [];

  for (let { id, name } of series) {
    const data = await getSeries(id, name, "thisWeek");

    if (data != null) {
      comics.push(data);
    }
  }

  return comics;
}

function printSeriesList() {
  let msg = [];
  for (let { id, name } of series) {
    msg.push(`Series: ${name} ID: ${id}`);
  }
  return msg.join("\n");
}

function addSeries(id, name) {
  series.push({ id, name });
  fs.writeFileSync("./series.json", JSON.stringify(series));
}

function removeSeries(id) {
  series = series.filter((s) => s.id !== id);
  fs.writeFileSync("./series.json", JSON.stringify(series));
}

client.login(process.env.JEFFBOT_DISCORD_TOKEN);
