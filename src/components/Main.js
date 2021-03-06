import {
    Vector3,
    Scene,
    HemisphereLight,
    LoadingManager,
    Clock,
    AnimationMixer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';

import Renderer from './Renderer';
import Camera from './Camera';
import Wall from './Wall';
import FloorTile from './FloorTile';
import Player from "./Player";
import KeyboardPlayer from "./KeyboardPlayer";
import KeyboardSpectator from "./KeyboardSpectator";
import Config from './Config';
import Collision from './Collision';
import SkyBox from './SkyBox';
import SE from './SE'


export default class Main {
    constructor(container) {

        this.socket = new WebSocket('ws://localhost:3000');
        this.socket.addEventListener('open', (event) => {
            console.log('Connected to WS Server');

            this.scene = new Scene();

            this.renderer = new Renderer(this.scene, container);

            this.camera = new Camera(this.renderer.threeRenderer);
            this.camera.threeCamera.position.set(1000, 1000, 1000);
            this.camera.threeCamera.lookAt(new Vector3(0, 0, 0));

            this.stats = new Stats();
            this.stats.showPanel(0); // 0: fps, 1: ms, 2: mb
            document.body.appendChild(this.stats.dom);

            this.clock = new Clock();

            this.manager = new LoadingManager();

            this.skybox = new SkyBox(this.scene, this.renderer);

            let mainLight = new HemisphereLight(0xffffff, 0x444444, 1);
            mainLight.position.set(0, 0, 0);
            this.scene.add(mainLight);

            this.player = null

            this.socket.addEventListener('message', event => {
                if (event.data[0] == "{") {
                    let data = JSON.parse(event.data);
                    if (data.action === "end") {
                        document.body.innerText = ""
                        document.location.href = 'http://localhost:3000/endPrint'
                    }
                }
            }, false);


            this.walls = [];

            this.gameData = fetch('http://localhost:3000/loadLevel', {
                method: "POST",
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ levelId: "Np0iZPe06SpzO7m5" })
            })
                .then(res => res.json())
                .then(result => {

                    this.playerId = result.playerId;
                    this.socket.send(JSON.stringify({ action: "set id", playerId: this.playerId }))

                    this.levelTheme = result.theme;

                    this.levelSize = result.levelData.size;

                    this.end = new SE(this.scene, 100, 100, this.levelSize / 2 - result.levelData.end.x, result.levelData.end.y, this.levelSize / 2 - result.levelData.end.z, this.levelTheme)

                    result.levelData.objects.forEach(tile => {
                        new FloorTile(this.scene, 100, this.levelSize / 2 - tile.x, -50, this.levelSize / 2 - tile.z, this.levelTheme)
                    })

                    result.levelData.walls.forEach(wall => {
                        let newWall = new Wall(this.scene, 100, 100, this.levelSize / 2 - wall.x, 0, this.levelSize / 2 - wall.z, this.levelTheme);
                        this.walls.push(newWall);
                    });

                    if (result.playerRole === "spectator") {
                        this.orbitControls = new OrbitControls(this.camera.threeCamera, this.renderer.threeRenderer.domElement);
                        this.role = "spectator";
                    } else {
                        this.role = "player";
                    }

                    this.player = new Player(this.scene, this.manager, this.levelSize / 2 - result.levelData.start.x, this.levelSize / 2 - result.levelData.start.z);
                    this.player.load(this.role);
                    return result;
                })
                .catch(error => { console.log(error); })



            this.manager.onProgress = (item, loaded, total) => {
                document.getElementById("loaded").innerText = `loading... ${loaded}/${total}`
            };

            this.manager.onLoad = () => {

                let loadingScreen = document.getElementById("loadingscreen");
                setTimeout(function () { loadingScreen.style.opacity = 0; loadingScreen.style.zIndex = -2; }, 500);

                this.isLoaded = true;

                this.playerCollision = new Collision(this.player, this.walls)

                this.mixer = new AnimationMixer(this.player.mesh)

                if (this.role === "player") {
                    this.keyboard = new KeyboardPlayer(window, this.playerAnimation, this.player.mesh, this.socket, this.playerId);
                    setInterval(() => {
                        if(!Config.end){this.socket.send(JSON.stringify({ action: "update position", data: { pos: this.player.mesh.position, rot: this.player.mesh.rotation }, playerId: this.playerId }));}
                    }, 1000);
                } else {
                    this.keyboard = new KeyboardSpectator(window, this.playerAnimation, this.player.mesh, this.socket);
                }
            };


            this.render();
        });

    }



    render() {
        this.stats.begin()

        // var delta = this.clock.getDelta();
        // if (this.playerAnimation) this.playerAnimation.update(delta)
        var delta = this.clock.getDelta();

        if (this.mixer) this.mixer.update(delta);

        this.renderer.render(this.scene, this.camera.threeCamera);

        if (this.isLoaded) {
            if(this.role=="player"){this.end.meta(this.player, this.socket, this.playerId)}

            if (Config.rotateLeft) {
                this.player.mesh.rotation.y += 0.05
            }
            if (Config.rotateRight) {
                this.player.mesh.rotation.y -= 0.05
            }
            if (Config.moveForward) {
                if (this.role === "player") {
                    this.mixer.clipAction(this.player.model.animations[0]).play()
                }
                // this.player.mesh.translateX(3);
                this.playerCollision.checkCollision(3);
            } else {
                if (this.role === "player") {
                    this.mixer.clipAction(this.player.model.animations[0]).stop();
                }
            }
            if (Config.moveBackward) {
                if (this.role === "player") {
                    // this.mixer.clipAction(this.player.model.animations[0]).stop()
                }

                // this.player.mesh.translateX(-3);
                this.playerCollision.checkCollision(-3);
            }

            if (this.role === "player") {

                const camVect = new Vector3(0, 30, -30)
                const camPos = camVect.applyMatrix4(this.player.mesh.matrixWorld);
                const pos = new Vector3(0, 10, 40)
                const poss = pos.applyMatrix4(this.player.mesh.matrixWorld)

                this.camera.threeCamera.position.x = camPos.x
                this.camera.threeCamera.position.y = camPos.y
                this.camera.threeCamera.position.z = camPos.z
                this.camera.threeCamera.lookAt(poss)
            }
        }

        this.stats.end()
        requestAnimationFrame(this.render.bind(this));
    }
}