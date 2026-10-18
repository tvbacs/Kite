import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface OfflineDinoScreenProps {
  url?: string;
  onRetry: () => void;
  onGoHome: () => void;
  isDarkTheme?: boolean;
}

export const OfflineDinoScreen: React.FC<OfflineDinoScreenProps> = ({
  url,
  onRetry,
  onGoHome,
  isDarkTheme = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const webViewRef = useRef<WebView>(null);

  // Xử lý thông điệp từ game (Rung Haptic chân thật khi Nhảy / Va chạm)
  const handleGameMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'jump') {
        setIsPlaying(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else if (data.type === 'crash') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else if (data.type === 'score_milestone') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch (e) {}
  }, []);

  // HTML + JS Độc lập 100% không cần Internet cho Trò chơi Khủng Long T-Rex
  const dinoHtml = useMemo(() => {
    const primaryColor = isDarkTheme ? '#e8eaed' : '#535353';
    const subColor = isDarkTheme ? '#9aa0a6' : '#757575';
    const bgColor = isDarkTheme ? '#202124' : '#ffffff';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
    }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: ${bgColor};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }
    #gameWrapper {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    canvas {
      width: 100%;
      height: 100%;
      display: block;
    }
    #hintOverlay {
      position: absolute;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      background: ${isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'};
      color: ${subColor};
      font-size: 11px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 12px;
      pointer-events: none;
      transition: opacity 0.3s;
      letter-spacing: 0.3px;
    }
  </style>
</head>
<body>
  <div id="gameWrapper">
    <canvas id="canvas"></canvas>
    <div id="hintOverlay">Chạm để nhảy & bắt đầu</div>
  </div>

  <script>
    (function() {
      const canvas = document.getElementById('canvas');
      const ctx = canvas.getContext('2d');
      const hint = document.getElementById('hintOverlay');

      const COLOR_PRIMARY = '${primaryColor}';
      const COLOR_SUB = '${subColor}';
      const IS_DARK = ${isDarkTheme ? 'true' : 'false'};

      let width = 0;
      let height = 0;
      let dpr = Math.min(window.devicePixelRatio || 2, 3);
      let groundY = 0;

      // Âm thanh 8-bit Procedural (Không dùng bất kỳ tệp ngoài nào)
      let audioCtx = null;
      function getAudioCtx() {
        if (!audioCtx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (AC) audioCtx = new AC();
        }
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
        return audioCtx;
      }

      function playSound(type) {
        try {
          const actx = getAudioCtx();
          if (!actx) return;
          const osc = actx.createOscillator();
          const gain = actx.createGain();
          osc.connect(gain);
          gain.connect(actx.destination);

          if (type === 'jump') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(450, actx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(900, actx.currentTime + 0.09);
            gain.gain.setValueAtTime(0.08, actx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.005, actx.currentTime + 0.09);
            osc.start();
            osc.stop(actx.currentTime + 0.09);
          } else if (type === 'milestone') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(660, actx.currentTime);
            osc.frequency.setValueAtTime(880, actx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.1, actx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.005, actx.currentTime + 0.2);
            osc.start();
            osc.stop(actx.currentTime + 0.2);
          } else if (type === 'crash') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(240, actx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(80, actx.currentTime + 0.18);
            gain.gain.setValueAtTime(0.12, actx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.005, actx.currentTime + 0.18);
            osc.start();
            osc.stop(actx.currentTime + 0.18);
          }
        } catch(e) {}
      }

      function sendToNative(type) {
        try {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: type }));
          }
        } catch(e) {}
      }

      function resize() {
        width = canvas.parentElement.clientWidth || 360;
        height = canvas.parentElement.clientHeight || 180;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        groundY = height - 28;
      }
      window.addEventListener('resize', resize);
      resize();

      // State game
      let gameState = 'IDLE'; // IDLE | RUNNING | OVER
      let score = 0;
      let highScore = parseInt(localStorage.getItem('kite_dino_hi') || '0', 10);
      let gameSpeed = 5.5;
      let frameCount = 0;
      let lastMilestone = 0;

      // Khủng long
      const dino = {
        x: 32,
        y: 0,
        w: 40,
        h: 43,
        vy: 0,
        gravity: 0.65,
        jumpSpeed: -11.5,
        isGrounded: true,
        legFrame: 0,
        blinkTimer: 0,
        isBlinking: false,

        reset() {
          this.y = groundY - this.h;
          this.vy = 0;
          this.isGrounded = true;
          this.legFrame = 0;
        },

        jump() {
          if (this.isGrounded) {
            this.vy = this.jumpSpeed;
            this.isGrounded = false;
            playSound('jump');
            sendToNative('jump');
          }
        },

        update() {
          if (!this.isGrounded) {
            this.vy += this.gravity;
            this.y += this.vy;
            if (this.y >= groundY - this.h) {
              this.y = groundY - this.h;
              this.vy = 0;
              this.isGrounded = true;
            }
          }

          if (gameState === 'RUNNING' && this.isGrounded) {
            if (frameCount % 6 === 0) {
              this.legFrame = (this.legFrame + 1) % 2;
            }
          }

          if (gameState === 'IDLE') {
            this.blinkTimer++;
            if (this.blinkTimer > 180) {
              this.isBlinking = true;
              if (this.blinkTimer > 195) {
                this.isBlinking = false;
                this.blinkTimer = 0;
              }
            }
          }
        },

        draw() {
          ctx.save();
          ctx.translate(this.x, this.y);
          ctx.fillStyle = COLOR_PRIMARY;

          // Thân và đầu khủng long phong cách Pixel Retro của Chrome
          // Đầu & Mõm
          ctx.fillRect(19, 0, 21, 15);
          ctx.fillRect(38, 1, 2, 4); // Mũi

          // Mắt
          if (!this.isBlinking && gameState !== 'OVER') {
            ctx.fillStyle = IS_DARK ? '#202124' : '#ffffff';
            ctx.fillRect(23, 3, 3, 3);
            ctx.fillStyle = COLOR_PRIMARY;
          } else if (gameState === 'OVER') {
            // Mắt "X" khi va chạm
            ctx.fillStyle = IS_DARK ? '#202124' : '#ffffff';
            ctx.fillRect(23, 2, 5, 5);
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(24, 3, 3, 3);
            ctx.fillStyle = COLOR_PRIMARY;
          }

          // Cổ và Thân
          ctx.fillRect(16, 15, 12, 18);
          ctx.fillRect(8, 20, 10, 13); // Lưng
          ctx.fillRect(0, 18, 8, 8);   // Đuôi vểnh lên
          ctx.fillRect(0, 24, 4, 4);

          // Cánh tay nhỏ
          ctx.fillRect(28, 22, 5, 3);
          ctx.fillRect(31, 25, 2, 3);

          // Chân
          if (this.isGrounded && gameState === 'RUNNING') {
            if (this.legFrame === 0) {
              // Chân trái chạm đất, chân phải gập
              ctx.fillRect(16, 33, 4, 10);
              ctx.fillRect(16, 41, 6, 2);
              ctx.fillRect(24, 33, 4, 5);
            } else {
              // Chân phải chạm đất, chân trái gập
              ctx.fillRect(16, 33, 4, 5);
              ctx.fillRect(24, 33, 4, 10);
              ctx.fillRect(24, 41, 6, 2);
            }
          } else if (!this.isGrounded) {
            // Đang nhảy: cả 2 chân co lại
            ctx.fillRect(16, 33, 4, 6);
            ctx.fillRect(24, 33, 4, 6);
          } else {
            // Đứng yên
            ctx.fillRect(16, 33, 4, 10);
            ctx.fillRect(16, 41, 6, 2);
            ctx.fillRect(24, 33, 4, 10);
            ctx.fillRect(24, 41, 6, 2);
          }

          ctx.restore();
        }
      };

      // Mây trời
      const clouds = [
        { x: 120, y: 35, speed: 0.6 },
        { x: 280, y: 55, speed: 0.5 },
        { x: 420, y: 25, speed: 0.7 },
      ];

      function updateClouds() {
        clouds.forEach(c => {
          if (gameState === 'RUNNING') {
            c.x -= c.speed;
            if (c.x < -60) {
              c.x = width + Math.random() * 80;
              c.y = 20 + Math.random() * 50;
            }
          }
          // Vẽ mây Pixel
          ctx.fillStyle = IS_DARK ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
          ctx.fillRect(c.x + 8, c.y, 24, 6);
          ctx.fillRect(c.x, c.y + 4, 40, 6);
          ctx.fillRect(c.x + 4, c.y + 8, 32, 4);
        });
      }

      // Mặt đất cuộn
      let groundOffset = 0;
      function drawGround() {
        ctx.strokeStyle = COLOR_PRIMARY;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, groundY + 0.5);
        ctx.lineTo(width, groundY + 0.5);
        ctx.stroke();

        // Các chấm sỏi nhỏ cuộn
        if (gameState === 'RUNNING') {
          groundOffset = (groundOffset + gameSpeed) % 40;
        }
        ctx.fillStyle = COLOR_SUB;
        for (let x = -groundOffset; x < width + 40; x += 36) {
          ctx.fillRect(x + 4, groundY + 4, 3, 1);
          ctx.fillRect(x + 18, groundY + 7, 2, 1);
          ctx.fillRect(x + 28, groundY + 3, 4, 1);
        }
      }

      // Chướng ngại vật (Xương rồng & Khủng long bay Pterodactyl)
      let obstacles = [];
      let nextObstacleTimer = 80;

      class Cactus {
        constructor() {
          this.type = Math.random() < 0.6 ? 'small' : 'large';
          this.variant = Math.floor(Math.random() * 3); // 0: đơn, 1: đôi, 2: ba
          this.h = this.type === 'small' ? 32 : 44;
          this.w = (this.variant + 1) * (this.type === 'small' ? 14 : 18);
          this.x = width + 20;
          this.y = groundY - this.h;
        }

        update() {
          this.x -= gameSpeed;
        }

        draw() {
          ctx.fillStyle = COLOR_PRIMARY;
          for (let i = 0; i <= this.variant; i++) {
            const ox = this.x + i * (this.type === 'small' ? 13 : 17);
            const stemW = this.type === 'small' ? 6 : 8;
            // Thân chính
            ctx.fillRect(ox + 4, this.y, stemW, this.h);
            // Nhánh trái
            ctx.fillRect(ox, this.y + 10, 4, 12);
            ctx.fillRect(ox, this.y + 10, 8, 4);
            // Nhánh phải
            ctx.fillRect(ox + stemW + 4, this.y + 14, 4, 12);
            ctx.fillRect(ox + stemW, this.y + 22, 8, 4);
          }
        }

        getBox() {
          return {
            x: this.x + 3,
            y: this.y + 2,
            w: this.w - 6,
            h: this.h - 4
          };
        }
      }

      class Bird {
        constructor() {
          this.w = 34;
          this.h = 24;
          this.x = width + 20;
          // Bay thấp (phải nhảy) hoặc bay cao
          this.y = groundY - (Math.random() < 0.65 ? 42 : 68);
          this.wingFrame = 0;
        }

        update() {
          this.x -= gameSpeed * 1.08;
          if (frameCount % 8 === 0) {
            this.wingFrame = (this.wingFrame + 1) % 2;
          }
        }

        draw() {
          ctx.fillStyle = COLOR_PRIMARY;
          // Thân chim Pterodactyl
          ctx.fillRect(this.x + 8, this.y + 6, 16, 6);
          // Mỏ
          ctx.fillRect(this.x, this.y + 7, 8, 3);
          // Mắt
          ctx.fillStyle = IS_DARK ? '#202124' : '#ffffff';
          ctx.fillRect(this.x + 6, this.y + 7, 2, 2);
          ctx.fillStyle = COLOR_PRIMARY;

          // Cánh đập lên / đập xuống
          if (this.wingFrame === 0) {
            ctx.fillRect(this.x + 12, this.y, 6, 6);
            ctx.fillRect(this.x + 16, this.y - 6, 6, 6);
          } else {
            ctx.fillRect(this.x + 12, this.y + 12, 6, 6);
            ctx.fillRect(this.x + 16, this.y + 18, 6, 6);
          }
        }

        getBox() {
          return {
            x: this.x + 2,
            y: this.y + 2,
            w: this.w - 4,
            h: this.h - 4
          };
        }
      }

      function checkCollision(dinoBox, obsBox) {
        return (
          dinoBox.x < obsBox.x + obsBox.w &&
          dinoBox.x + dinoBox.w > obsBox.x &&
          dinoBox.y < obsBox.y + obsBox.h &&
          dinoBox.y + dinoBox.h > obsBox.y
        );
      }

      function formatScore(n) {
        return ('00000' + Math.floor(n)).slice(-5);
      }

      function drawScore() {
        ctx.fillStyle = COLOR_PRIMARY;
        ctx.font = '700 13px "Courier New", Courier, monospace';
        ctx.textAlign = 'right';

        const curText = formatScore(score);
        if (highScore > 0) {
          ctx.fillStyle = COLOR_SUB;
          ctx.fillText('HI ' + formatScore(highScore) + '  ', width - 75, 24);
          ctx.fillStyle = COLOR_PRIMARY;
        }
        ctx.fillText(curText, width - 18, 24);
      }

      function drawGameOver() {
        ctx.fillStyle = COLOR_PRIMARY;
        ctx.font = '700 15px "Courier New", Courier, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('G A M E   O V E R', width / 2, height / 2 - 14);

        // Biểu tượng nút Replay tròn
        const rx = width / 2;
        const ry = height / 2 + 18;
        ctx.strokeStyle = COLOR_PRIMARY;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(rx, ry, 13, 0.4 * Math.PI, 1.85 * Math.PI);
        ctx.stroke();

        // Mũi tên replay
        ctx.fillStyle = COLOR_PRIMARY;
        ctx.beginPath();
        ctx.moveTo(rx + 11, ry - 6);
        ctx.lineTo(rx + 18, ry - 6);
        ctx.lineTo(rx + 14, ry + 2);
        ctx.fill();
      }

      function handleAction() {
        if (gameState === 'IDLE') {
          gameState = 'RUNNING';
          hint.style.opacity = '0';
          dino.reset();
          dino.jump();
        } else if (gameState === 'RUNNING') {
          dino.jump();
        } else if (gameState === 'OVER') {
          // Khởi động lại ván chơi
          obstacles = [];
          score = 0;
          gameSpeed = 5.5;
          frameCount = 0;
          lastMilestone = 0;
          gameState = 'RUNNING';
          dino.reset();
          dino.jump();
        }
      }

      // Bắt tương tác cảm ứng cực nhạy
      window.addEventListener('touchstart', function(e) {
        e.preventDefault();
        handleAction();
      }, { passive: false });

      window.addEventListener('mousedown', function(e) {
        handleAction();
      });

      window.addEventListener('keydown', function(e) {
        if (e.code === 'Space' || e.code === 'ArrowUp') {
          e.preventDefault();
          handleAction();
        }
      });

      // Vòng lặp trò chơi 60FPS
      function loop() {
        ctx.clearRect(0, 0, width, height);

        updateClouds();
        drawGround();

        if (gameState === 'IDLE') {
          dino.y = groundY - dino.h;
          dino.update();
          dino.draw();
          drawScore();
        } else if (gameState === 'RUNNING') {
          frameCount++;
          score += 0.15;

          // Tăng tốc dần theo điểm
          gameSpeed = Math.min(13, 5.5 + Math.floor(score / 100) * 0.5);

          // Âm thanh và rung haptic mỗi 100 điểm
          const curFloor = Math.floor(score);
          if (curFloor > 0 && curFloor % 100 === 0 && curFloor !== lastMilestone) {
            lastMilestone = curFloor;
            playSound('milestone');
            sendToNative('score_milestone');
          }

          dino.update();
          dino.draw();

          // Sinh chướng ngại vật ngẫu nhiên
          nextObstacleTimer--;
          if (nextObstacleTimer <= 0) {
            if (score > 280 && Math.random() < 0.35) {
              obstacles.push(new Bird());
            } else {
              obstacles.push(new Cactus());
            }
            // Khoảng cách giữa các chướng ngại vật
            nextObstacleTimer = Math.floor(65 + Math.random() * 60 - Math.min(25, gameSpeed * 2));
          }

          // Cập nhật và kiểm tra va chạm
          const dinoBox = {
            x: dino.x + 8,
            y: dino.y + 4,
            w: dino.w - 14,
            h: dino.h - 6
          };

          for (let i = obstacles.length - 1; i >= 0; i--) {
            const obs = obstacles[i];
            obs.update();
            obs.draw();

            if (checkCollision(dinoBox, obs.getBox())) {
              gameState = 'OVER';
              playSound('crash');
              sendToNative('crash');

              if (score > highScore) {
                highScore = Math.floor(score);
                try {
                  localStorage.setItem('kite_dino_hi', highScore.toString());
                } catch(e) {}
              }
            }

            if (obs.x + obs.w < -10) {
              obstacles.splice(i, 1);
            }
          }

          drawScore();
        } else if (gameState === 'OVER') {
          dino.draw();
          obstacles.forEach(o => o.draw());
          drawScore();
          drawGameOver();
        }

        requestAnimationFrame(loop);
      }

      dino.reset();
      requestAnimationFrame(loop);
    })();
  </script>
</body>
</html>
    `;
  }, [isDarkTheme]);

  return (
    <View
      style={[
        styles.container,
        isDarkTheme && styles.darkContainer,
      ]}
    >
      {/* 1. KHU VỰC TRÒ CHƠI KHỦNG LONG CHROME T-REX RUNNER */}
      <View
        style={[
          styles.gameContainer,
          isDarkTheme && styles.darkGameContainer,
        ]}
      >
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: dinoHtml }}
          style={styles.webView}
          onMessage={handleGameMessage}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          javaScriptEnabled={true}
          domStorageEnabled={true}
        />
      </View>

      {/* 2. THÔNG BÁO VÀ HƯỚNG DẪN KHẮC PHỤC KẾT NỐI MẠNG */}
      <View style={styles.infoSection}>
        <View style={styles.headerRow}>
          <View
            style={[
              styles.iconCircle,
              isDarkTheme && styles.darkIconCircle,
            ]}
          >
            <Feather
              name="wifi-off"
              size={20}
              color={isDarkTheme ? '#f87171' : '#ef4444'}
            />
          </View>
          <Text
            style={[
              styles.title,
              isDarkTheme && styles.darkText,
            ]}
          >
            Không có kết nối Internet
          </Text>
        </View>

        {url && url !== 'chrome://dino' && url !== 'kite://dino' ? (
          <Text
            style={[
              styles.urlSubtitle,
              isDarkTheme && styles.darkSubText,
            ]}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            Không thể tải: {url}
          </Text>
        ) : null}

        <View
          style={[
            styles.stepsCard,
            isDarkTheme && styles.darkStepsCard,
          ]}
        >
          <Text
            style={[
              styles.stepsCardTitle,
              isDarkTheme && styles.darkSubText,
            ]}
          >
            Gợi ý khắc phục:
          </Text>

          <View style={styles.stepItem}>
            <Text style={styles.bulletPoint}>•</Text>
            <Text
              style={[
                styles.stepText,
                isDarkTheme && styles.darkStepText,
              ]}
            >
              Kiểm tra kết nối Wi-Fi hoặc dữ liệu di động (4G/5G).
            </Text>
          </View>

          <View style={styles.stepItem}>
            <Text style={styles.bulletPoint}>•</Text>
            <Text
              style={[
                styles.stepText,
                isDarkTheme && styles.darkStepText,
              ]}
            >
              Bật rồi tắt Chế độ máy bay để làm mới sóng mạng.
            </Text>
          </View>

          <View style={styles.stepItem}>
            <Text style={styles.bulletPoint}>•</Text>
            <Text
              style={[
                styles.stepText,
                isDarkTheme && styles.darkStepText,
              ]}
            >
              Kiểm tra modem hoặc bộ định tuyến Wi-Fi gia đình.
            </Text>
          </View>
        </View>

        <View style={styles.errorChip}>
          <Text
            style={[
              styles.errorCode,
              isDarkTheme && styles.darkErrorCode,
            ]}
          >
            Mã lỗi: ERR_INTERNET_DISCONNECTED
          </Text>
        </View>

        {/* 3. NÚT HÀNH ĐỘNG: TẢI LẠI TRANG & VỀ TRANG CHỦ */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[
              styles.secondaryButton,
              isDarkTheme && styles.darkSecondaryButton,
            ]}
            onPress={onGoHome}
            activeOpacity={0.75}
          >
            <Feather
              name="home"
              size={16}
              color={isDarkTheme ? '#d1d5db' : '#4b5563'}
            />
            <Text
              style={[
                styles.secondaryButtonText,
                isDarkTheme && styles.darkSecondaryButtonText,
              ]}
            >
              Trang chủ
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onRetry}
            activeOpacity={0.85}
          >
            <Feather name="rotate-cw" size={16} color="#ffffff" />
            <Text style={styles.primaryButtonText}>Tải lại trang</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  darkContainer: {
    backgroundColor: '#202124',
  },
  gameContainer: {
    height: 185,
    width: '100%',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  darkGameContainer: {
    backgroundColor: '#202124',
    borderBottomColor: '#2d3748',
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  infoSection: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  darkIconCircle: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.2,
  },
  darkText: {
    color: '#f9fafb',
  },
  urlSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
    marginBottom: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  darkSubText: {
    color: '#9ca3af',
  },
  stepsCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
  },
  darkStepsCard: {
    backgroundColor: '#282a2d',
    borderColor: '#3c4043',
  },
  stepsCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  bulletPoint: {
    fontSize: 14,
    lineHeight: 18,
    color: '#007aff',
    marginRight: 8,
    fontWeight: '700',
  },
  stepText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#334155',
  },
  darkStepText: {
    color: '#d1d5db',
  },
  errorChip: {
    marginBottom: 20,
  },
  errorCode: {
    fontSize: 11,
    color: '#94a3b8',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  darkErrorCode: {
    color: '#64748b',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 'auto',
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  darkSecondaryButton: {
    backgroundColor: '#282a2d',
    borderColor: '#3c4043',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  darkSecondaryButtonText: {
    color: '#e2e8f0',
  },
  primaryButton: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#007aff',
    shadowColor: '#007aff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});
