// Використовуємо системний mongod, щоб mongodb-memory-server нічого не завантажував.
module.exports = async () => {
  process.env.MONGOMS_SYSTEM_BINARY = process.env.MONGOMS_SYSTEM_BINARY || '/usr/bin/mongod';
};
