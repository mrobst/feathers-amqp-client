const amqp = require('amqplib');
const exitHook = require('async-exit-hook');

let connection;
const disconnectTasks = [];
let clientClosed = false;

const sleepSeconds = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

// function to publish to amqp
async function pushStream(message, config) {
  const { maxRetries = Infinity, server = config.server.name, reconnectDelay = 5 } = config;
  let channel;

  /*   function publish(message) {
      const content = JSON.parse(message.content);
  
      // for backwards-compatibility. sometimes the message content is double-strinigified
      const payload = content.data || JSON.parse(content).data;
  
      fn(payload);
  } */
  async function initialize() {
    // reuse an existing connection if present
    if (!connection) {
      // console.log('server name from feathers-amqp-client initialize is ', server);
      connection = await amqp.connect(server.name).catch((error) => console.log('amqp.connect error ', error));
    }

    channel = await connection.createChannel();

    // If some error causes the channel or the connection to go down, attempt to reconnect
    channel.on('error', (e) => {
      console.error('Feathers-AMQP-Client: Channel closed with error', { reason: e });
      attemptReconnect();
    });

    connection.on('error', (e) => {
      console.error('Feathers-AMQP-Client: Connection closed with error', { reason: e });
      attemptReconnect();
    });

    // When the channel is closed by the server, attempt to reconnect
    // Do not respond to a closed connection - the reconnect is handled by the closed channel
    channel.on('close', () => {
      if (clientClosed) return;

      console.error('Feathers-AMQP-Client: Channel closed by server');
      attemptReconnect();
    });

    channel.assertExchange(config.exchange.name, config.exchange.type || 'fanout', {
      durable: config.durable || false,
    });

    const queue = await channel.assertQueue(config.queue.name, { exclusive: config.queue.exclusive || false });

    console.log('Feathers-AMQP-Client: Binding queue %s with exchange %s', config.queue.name, config.exchange.name);
    await channel.bindQueue(queue.queue, config.exchange.name);

    exitHook(close);
    disconnectTasks.push(close);

    console.log('Feathers-AMQP-Client: Waiting to publish messages in %s.', config.queue.name);
    console.log('Feathers-AMQP-Client: Message to send is ', message);
    return channel.publish(config.exchange.name, queue.queue, Buffer.from(message), { noAck: true });
  }

  async function close() {
    console.log('Feathers-AMQP-Client: Disconnecting from AMQP server...');
    clientClosed = true;
    try {
      await channel.close();
      return connection.close();
    } catch (error) {
      // ignore errors here in case the connection has already been closed
      return null;
    }
  }

  function attemptReconnect(reconnectRetries = maxRetries) {
    if (clientClosed) return;

    // clear the connection to force a reconnect
    connection = null;

    // the channel is broken for some reason (e.g. the AMQP broker is down)
    // attempt to re-establish a connection and try again
    // unless the retries are down to zero
    if (reconnectRetries > 0) {
      console.error(
        `Feathers-AMQP-Client: Attempting to reconnect.
        Retries: ${reconnectRetries}, reconnect delay: ${reconnectDelay}s`
      );
      sleepSeconds(reconnectDelay)
        .then(() => initialize(reconnectRetries - 1))
        .catch((error) => {
          // reconnection failed - try again (decrementing retries)
          console.error('Feathers-AMQP-Client: Reconnection failed', { reason: error });
          return attemptReconnect(reconnectRetries - 1);
        });
    } else {
      console.error('Feathers-AMQP-Client: No more retries - giving up reconnecting');
    }
  }

  return initialize();
}

async function bindStream(fn, config) {
  const { maxRetries = Infinity, server = config.server.name, reconnectDelay = 5 } = config;
  let channel;

  function consume(message) {
    console.log('consume function with message', message.content.toString());
    const content = JSON.parse(message.content.toString());

    // for backwards-compatibility. sometimes the message content is double-strinigified
    const payload = content.data || JSON.parse(content).data;

    fn(payload);
  }

  async function initialize() {
    // reuse an existing connection if present
    if (!connection) {
      // console.log('server name from feathers-amqp-client initialize is ', server);
      connection = await amqp.connect(server.name).catch((error) => console.log('amqp.connect error ', error));
    }

    channel = await connection.createChannel();

    // If some error causes the channel or the connection to go down, attempt to reconnect
    channel.on('error', (e) => {
      console.error('Feathers-AMQP-Client: Channel closed with error', { reason: e });
      attemptReconnect();
    });

    connection.on('error', (e) => {
      console.error('Feathers-AMQP-Client: Connection closed with error', { reason: e });
      attemptReconnect();
    });

    // When the channel is closed by the server, attempt to reconnect
    // Do not respond to a closed connection - the reconnect is handled by the closed channel
    channel.on('close', () => {
      if (clientClosed) return;

      console.error('Feathers-AMQP-Client: Channel closed by server');
      attemptReconnect();
    });

    channel.assertExchange(config.exchange.name, config.exchange.type || 'fanout', {
      durable: config.durable || false,
    });

    const queue = await channel.assertQueue(config.queue.name, { exclusive: config.queue.exclusive || false });

    console.log('Feathers-AMQP-Client: Binding queue %s with exchange %s', config.queue.name, config.exchange.name);
    await channel.bindQueue(queue.queue, config.exchange.name);

    exitHook(close);
    disconnectTasks.push(close);

    console.log('Feathers-AMQP-Client: Waiting for messages in %s.', config.queue.name);
    return channel.consume(queue.queue, (message) => consume(message), { noAck: true });
  }

  async function close() {
    console.log('Feathers-AMQP-Client: Disconnecting from AMQP server...');
    clientClosed = true;
    try {
      await channel.close();
      return connection.close();
    } catch (error) {
      // ignore errors here in case the connection has already been closed
      return null;
    }
  }

  function attemptReconnect(reconnectRetries = maxRetries) {
    if (clientClosed) return;

    // clear the connection to force a reconnect
    connection = null;

    // the channel is broken for some reason (e.g. the AMQP broker is down)
    // attempt to re-establish a connection and try again
    // unless the retries are down to zero
    if (reconnectRetries > 0) {
      console.error(
        `Feathers-AMQP-Client: Attempting to reconnect.
        Retries: ${reconnectRetries}, reconnect delay: ${reconnectDelay}s`
      );
      sleepSeconds(reconnectDelay)
        .then(() => initialize(reconnectRetries - 1))
        .catch((error) => {
          // reconnection failed - try again (decrementing retries)
          console.error('Feathers-AMQP-Client: Reconnection failed', { reason: error });
          return attemptReconnect(reconnectRetries - 1);
        });
    } else {
      console.error('Feathers-AMQP-Client: No more retries - giving up reconnecting');
    }
  }

  return initialize();
}

function disconnect() {
  return Promise.all(disconnectTasks.map((fn) => fn()));
}

module.exports = {
  bindStream,
  pushStream,
  disconnect,
};
