const fs = require('fs');
var csvWriter = require('csv-write-stream');
const csvParser = require('csv-parser')
const express = require('express');
const bodyParser = require('body-parser');
const port = 3695;
const app = express();

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  // authentication middleware
  const auth = {login: 'MWMonitoring', password: 'MWMonitoring'}

  // parse login and password from headers
  const b64auth = (req.headers.authorization || '').split(' ')[1] || ''
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':')

  // Verify login and password are set and correct
  if (login && password && login === auth.login && password === auth.password) {
    return next()
  }

  // Refuse connection if authentification failed
  res.set('WWW-Authenticate', 'Basic realm="401"')
  res.status(401).send('Authentication required.')
})

app.get('/usage', function(req, res) {
  res.sendFile('index.html', {root: __dirname })
});

app.get('/api/getallserver/:time', (req, res) => {
  let allserver = [];
  fs.readdirSync("monitoringdata/").forEach(file => {
    let filedate = new Date(fs.statSync("monitoringdata/"+file).mtime).getTime()
    let timesincemod = Date.now()-filedate
    if (req.params.time > timesincemod) {
      allserver.push({"server":file.split('.').slice(0, -1).join('.'),"time":timesincemod})
    }
  });
  res.send(allserver)
})
 
app.get('/api/getserver/:server/:time', (req, res, next) => {
  let time = req.params.time
  if (!fs.existsSync('monitoringdata/'+req.params.server+'.csv')) { res.status(404).send('No data for '+req.params.server+'.'); return next()}
  let serverusage = [];
  fs.createReadStream('monitoringdata/'+req.params.server+'.csv')
    .pipe(csvParser())
    .on('data', (data) => {
      if (Date.now()-data.time < time) {
        serverusage.push(data);
      }
    })
    .on('end', () => {
      res.send(serverusage)
    })
})
 
// Get feed from java plugin
app.post('/usagefeed', (req, res) => {
  let data = req.body;
  savefeed(data)
  res.send('Data received successfully');
})
 
// Start app listening to port 
app.listen(port, () => {
  console.log(`MwMonitoring Merger listening on port ${port}!`)
})

// Fonction to save feed to dedicated csv file
const savefeed = (feed) => {
  // save path to csv file
  let pathtocsv = "monitoringdata/"+feed.servername+".csv"

  // test if csv file exist if not create file and write header
  if (!fs.existsSync(pathtocsv)) {
    fs.open(pathtocsv, 'w', function (err, file) {
      if (err) throw err;
      console.log('Data for '+feed.servername+" didn't exist so file was created!");
    });
    writer = csvWriter({ headers: ["time", "tps", "cpuusage", "memoryused", "memorytotal", "memoryfree", "pingaverage", "pingmedian", "pingmin", "pingmax", "playeronline", "playermax"]});
  } else {
    writer = csvWriter({sendHeaders: false});
  }

  if (feed.tps > 20) {feed.tps = 20}

  // open csv file and append recieved data
  writer.pipe(fs.createWriteStream(pathtocsv, {flags: 'a'}));
  writer.write({
    time:Date.now(), 
    tps:feed.tps, 
    cpuusage:feed.cpu, 
    memoryused:feed.ramMB.used, 
    memorytotal:feed.ramMB.total, 
    memoryfree:feed.ramMB.free, 
    pingaverage:feed.ping.average, 
    pingmedian:feed.ping.median, 
    pingmin:feed.ping.min, 
    pingmax:feed.ping.max, 
    playeronline:feed.players.current, 
    playermax:feed.players.max,
  });
  writer.end();

  console.log('Data for '+feed.servername+" saved successfully");
}