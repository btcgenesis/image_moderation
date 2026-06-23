const tf = require("@tensorflow/tfjs-node");
const nsfwjs = require("nsfwjs");

(async () => {
  const model = await nsfwjs.load();
  console.log("loaded");
})();