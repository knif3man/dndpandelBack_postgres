const express = require('express');
const pool = require('./db');
const cors = require('cors')

const app = express();
const http = require('http').Server(app);
app.use(cors());

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    next();
});

app.use(express.json());

const socketIO = require('socket.io')(http, {
    cors: {
        origin: "*",
    }
  });
  
app.use(cors());



socketIO.on('connection', (socket) => {
    // console.log(`${socket.id} Connected`)
    // socketIO.emit('tesst',`Ураааа!!! ${socket.id} подключился!!!`)  
})

pool.query('SELECT NOW()', (err, res) => {
  if(err) {
    console.error('Error connecting to the database', err.stack);
  } else {
    console.log('Connected to the database:', res.rows);
  }
});

app.get('/test', cors(), async(req,res)=>{
    console.log('tested')
    try {
        const result = await pool.query(``);
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
})

app.post('/login', cors(), async(req, res) => {
    console.log(req.body)
    if(req.body.user && req.body.password){
        const result = await pool.query(`SELECT passwd,status FROM users WHERE nick='${[req.body.user]}'`);
        res.setHeader('Content-Type','application/json')
        if(result.rows){
                if (result.rows.length != 0){
                    if(result.rows[0].passwd == req.body.password) {    
                        if(result.rows[0].status == 'gm'){
                            res.send({error:'',status:true,gm:true})
                        }else {
                            res.send({error:'',status:true,gm:false})
                        }
                    
                    } else {
                        res.send({error:'Неправильный пароль',status:false,gm:false})
                    }
                } else {
                    res.send({error:'Нет такого пользователя',status:false,gm:false})
                }
            } else {
                res.send({error:'Нет такого пользователя',status:false,gm:false})
            }
    }
});

app.get('/getAvailableStatus',cors(),async(req,res)=>{
    const result = await pool.query(`SELECT * FROM "statusEffects"`);
    res.status(200).json(result.rows);
})

async function getHidedChars(){
    return new Promise(async (resolve, reject) => {
        await pool.query(`SELECT * FROM "hidedChars"`).then((result) => {
             // I assume this is how an error is thrown with your db callback
            resolve(result.rows);
        });
    });
}


app.get('/test12', cors(), async (req,res)=>{
    let h = await getHidedChars()
    console.log(h)
    res.setHeader('Content-Type','application/json')
    res.status(200).json(h)
})

app.post('/getChar', cors(), async(req, res) => {
    try{
        var response = {}
        const result = await pool.query(`SELECT characters.char_name,characters."MAX_HP",characters."CURRENT_HP",characters."EXP",characters."GOLD",characters."LVL",xp_levels.xp_value FROM characters INNER JOIN xp_levels ON characters."LVL" + 1 = xp_levels.level`);
        let hidedChars = await getHidedChars()
        let charList = result.rows
        charList.sort((a,b)=>{
            // console.log(`Сравниваю букву: ${a.char_name.split('')[0] } и букву: ${b.char_name.split('')[0]}`)
            if(a.char_name.split('')[0]    < b.char_name.split('')[0]){
                return -1
            } else if (a.char_name.split('')[0] == b.char_name.split('')[0]){
                // console.log(`Сравниваю голду: ${a.GOLD} и голду: ${b.GOLD}`)
                if(a.GOLD < b.GOLD){
                    return 1
                } else if(a.GOLD == b.GOLD){
                    return 0
                } else {
                    return -1
                }
                return 0
            } else {
                return 1
            }
        })

            for(let row of charList){
                if(row.char_name.indexOf('RIP') == -1){
                    response[result.rows.indexOf(row)] = row
                }
            }

            for(let hide of hidedChars){
                for(let row of result.rows){
                    if(hide.charName == row.char_name){
                        delete response[result.rows.indexOf(row)]
                    }
                }
            }
            res.setHeader('Content-Type','application/json')
            res.status(200).json(response);

        

    }catch(e){
        res.setHeader('Content-Type','plain/text')
        res.send(e)
    }
})

app.post('/getCharStatusEffects', cors(), async(req, res) => {
    console.log(req.body.user)
    const result = await pool.query('SELECT "charName","statusEffect" FROM "userStatusEffects"')
    console.log(result.rows)
    res.setHeader('Content-Type','application/json')
    res.send(result.rows)
})

app.post('/getCharsheet', cors(), async(req, res) => {
    const result = await pool.query(`SELECT * FROM charsheets WHERE charname='${req.body.charname}'`)
    res.setHeader('Content-Type','application/json')
    res.send(result.rows)
})

app.get('/getHidedCharacters',cors(),async(req,res)=>{
    const result = await pool.query(`SELECT * FROM "hidedChars"`)
    res.setHeader('Content-type','application/JSON')
    res.send(JSON.stringify(result.rows))
})

app.post('/hideCharacters',cors(),async(req,res)=>{
    for(let c of Object.keys(req.body)){
        const result = await pool.query(`SELECT * FROM "hidedChars" WHERE "charName"='"${c}"'`)
        console.log(result.rows)
        if(result.rows.length == 0){
            console.log(`INSERT INTO "hidedChars" VALUES(DEFAULT,'${c}', '${req.body[c]}')`)
            await pool.query(`INSERT INTO "hidedChars" VALUES(DEFAULT, '${c}', '${req.body[c]}')`)
        }
    }
    socketIO.emit('needUpdateCharactersData',true)
    res.setHeader('Content-type','application/JSON')
    res.send(JSON.stringify({1:1}))
})

app.post('/setCharVisibility', cors(), async(req, res) => {
    const result = await pool.query(`DELETE FROM "hidedChars" WHERE "charName"='${Object.keys(req.body)[0]}'`)
    socketIO.emit('needUpdateCharactersData',true)
    res.send('ok')
})

app.post('/createCharacter', cors(), async(req, res) => {
    try{
        console.log(req.body)
        let newCharReq = req.body
        const result = await pool.query(`SELECT id,"char_name" FROM characters WHERE "char_name" not like '%RIP%'`)
        let isCharNameFree = true
        for(let row of result.rows){
            if ((row['char_name']).toUpperCase() == (newCharReq.name).toUpperCase()){
                isCharNameFree = false
            }
        }
        console.log(`char name: ${newCharReq.name} is free to use`)
        if(isCharNameFree){ 
            const xps = await pool.query(`SELECT xp_value from xp_levels WHERE level=${newCharReq.lvl}`)
            let sentances = `INSERT INTO characters VALUES(DEFAULT,'${newCharReq.name}',${newCharReq.maxHp}, ${newCharReq.maxHp}, ${xps.rows[0]['xp_value']}, ${newCharReq.gold}, ${newCharReq.lvl}, '${newCharReq.player}', 0)`
            console.log(sentances)
            const q = await pool.query(sentances)
            let sentances_charsheet = `INSERT INTO charsheets (id, charname, playername, maxhp, experiencepoints) VALUES (DEFAULT, '${newCharReq.name}', '${newCharReq.player}', ${newCharReq.maxHp}, ${xps.rows[0]['xp_value']})`
            console.log(sentances_charsheet)
            const w = await pool.query(sentances_charsheet)
            res.setHeader('Content-Type','plain/text')
            res.send('ok')
            socketIO.emit('needUpdateCharactersData',true)
        } else {
            res.setHeader('Content-Type','plain/text')
            res.send('Error, that name is used')
        }
    }catch(e){
        console.log(e)
        res.setHeader('Content-Type','plain/text')
        res.send(e)
    }
})

app.post('/changeCharacters', cors(), async(req, res) => {
    const characterToChange = Object.keys(req.body)
    console.log(req.body)
    for(let char of characterToChange){
        for(let prop in req.body[char]){
            if(req.body[char][prop] != ''){
                console.log(prop)
                if(prop == 'CURRENT_HP'){
                    const max_hp = await pool.query(`SELECT "MAX_HP" FROM characters WHERE "char_name" = '${char}'`)
                    const curhp = await pool.query(`SELECT "${prop}" FROM characters WHERE "char_name" = '${char}'`)
                    if((curhp.rows[0][prop] + parseInt(req.body[char][prop]))>=(max_hp.rows[0]['MAX_HP'])){
                        await pool.query(`UPDATE characters SET "${prop}"= ${(max_hp.rows[0]['MAX_HP'])} WHERE "char_name" = '${char}'`)
                    } else {
                        await pool.query(`UPDATE characters SET "${prop}"=${(curhp.rows[0][prop] + parseInt(req.body[char][prop]))} WHERE "char_name"='${char}'`)
                    }
                    if((curhp.rows[0][prop] + parseInt(req.body[char][prop]))<0){
                       await pool.query(`UPDATE characters SET "${prop}"=0 WHERE "char_name"='${char}'`)
                    }
                } else if(prop == "addStatusEffects" ){
                    if(req.body[char][prop] != 'none'){
                        await pool.query(`INSERT INTO "userStatusEffects" VALUES (DEFAULT,'${char}','${req.body[char][prop]}')`)
                    }
                }else if(prop == 'removeStatusEffects'){
                    try{
                        if(req.body[char][prop] != 'none'){
                            await pool.query(`DELETE FROM "userStatusEffects" WHERE "charName"='${char}' AND "statusEffect"='${req.body[char][prop]}'`)
                        }
                    } catch (e){
                        console.log(e)
                    }
                } else {
                    const curprop = await pool.query(`SELECT "${prop}" FROM characters WHERE "char_name" = '${char}'`)
                    await pool.query(`UPDATE characters SET "${prop}"=${(curprop.rows[0][prop] + parseInt(req.body[char][prop]))} WHERE "char_name" = '${char}'`)
                }
                
            }
        }
    }
    socketIO.emit('needUpdateCharactersData',true)
    res.send({status:'ok',changedCharacter:characterToChange})
})

app.post('/saveCharData', cors(), async(req, res) => {
    try{
        for(let property in req.body){

            if(parseInt(property) < 6 || property.indexOf('death') != -1 || property.indexOf('inspir') != -1 || property.indexOf('-prof') != -1){
                console.log(property)
                await pool.query(`UPDATE charsheets SET "${property}"=${req.body[property]} WHERE charname='${req.body.charname}'`)
            } else {
                await pool.query(`UPDATE charsheets SET "${property}"='${req.body[property].toString().replace(/\n/g,'@@@X')}' WHERE charname='${req.body.charname}'`)
    
                if(property == 'maxhp'){
                    try{
                        console.log('UPDATE characters SET "MAX_HP" = ? WHERE char_name = "'+req.body.charname+'"')
                        await pool.query(`UPDATE characters SET "MAX_HP"=${parseInt(req.body[property])} WHERE char_name='${req.body.charname}'`)
                    }catch(e){
                        console.log(e)
                    }
                }
            }
        }
    
        res.send({
            status:'Сохранено',
        })
    } catch(e){
        res.send({
            status:'Ошибка'
        })  
    }
    
})

app.get('/checkEncounter',cors(), async(req,res)=>{
    const result = await pool.query(`SELECT * from "isEncounterStarted"`)
    res.setHeader('Content-Type','application/json')
    if(result.rows){
        if(result.rows.length == 0){
            res.send(JSON.stringify({data:'no'}))
        } else {
            console.log(result.rows)
            res.send(JSON.stringify({data:'yes'}))
        }
    } else {
        res.send(JSON.stringify({data:'yes'}))
    }
})

app.post('/encounterInit', cors(), async(req, res) => {
   console.log(req.body.data)
   await pool.query('DELETE FROM "encounterCounter"')
   await pool.query('DELETE FROM "encounter"')

   for(let char of Object.keys(req.body.data)){
    console.log('char: ' + char, 'initiative: ' + req.body.data[char].toString())
    console.log(`INSERT INTO encounter VALUES(NULL,'${char}', ${parseInt(req.body.data[char])})`)
    const err = await pool.query(`INSERT INTO encounter VALUES(DEFAULT,'${char}', ${parseInt(req.body.data[char])})`)
        if (err) {
            console.error("Commit error:", err);
        } else {
            console.log("insert successfully.");
        }
   }

   await pool.query('DELETE FROM "isEncounterStarted"')
   await pool.query(`INSERT INTO "isEncounterStarted" VALUES(DEFAULT,'True')`)
   socketIO.emit('encounterStart',true)
   res.send('ok')
})

app.post('/setEncounterPosition', cors(), async(req, res) => {
    console.log(req.body.newPosition)
    await pool.query('DELETE FROM "encounterCounter"')
    await pool.query(`INSERT INTO "encounterCounter" VALUES(DEFAULT,${req.body.newPosition})`)
    socketIO.emit('updateEncounterCounterPosition',true)
    res.send('ok')
 })

 app.get('/getEncounterCounterPosition',cors(), async(req,res)=>{
    const result = await pool.query('SELECT * FROM "encounterCounter"')
    res.setHeader('Content-Type','application/json')
    res.send(result.rows)
 })

app.get('/getEncounterData',cors(), async(req,res)=>{
    const result = await pool.query(`SELECT "char_name",initiative FROM encounter`)
    res.setHeader('Content-Type','application/json')
    res.send(result.rows)
})

app.get('/stopEncounter',cors(), async(req,res)=>{
    await pool.query('DELETE FROM "isEncounterStarted"')
    const result = await pool.query(`SELECT id FROM "encounterCounter"`)
    console.log(result.rows[0].id)
    const err = await pool.query(`UPDATE "encounterCounter" SET "counterPosition"=0 WHERE id=${result.rows[0].id}`)
    if (err) {
        console.error("update error:", err);
    } else {
        console.log("changer counterPosition to 0 successfully.");
    }
    socketIO.emit('stopEncounter',true)
    res.send('stopped')
})

app.post('/addLvl',cors(),async(req, res) => {
    try{
        console.log(req.body)
        const charname = req.body.char_name
        const currentEXP = req.body.currentEXP
        const potentialEXP = req.body.potentialEXP

        console.log(charname,currentEXP,potentialEXP)
        const result = await pool.query(`SELECT level, "xp_value" FROM xp_levels where "xp_value" <= ${potentialEXP} \nORDER BY "xp_value" DESC limit 1`)

        await pool.query(`UPDATE characters SET "LVL"=${result.rows[0].level} WHERE "char_name"='${charname}'`)
        socketIO.emit('needUpdateCharactersData',true)
        res.send(`to lvl ${(result.rows[0].level)} you need:${result.rows[0].xp_value} EXP`)
    }catch(e){
        console.log(e)
    }
})

app.get('/q',cors(),async(req, res) => {
    res.send('asfjda')
})

http.listen(process.env.PORT || 3000, () => {
    console.log(`Server listening on ${process.env.PORT}`);
});