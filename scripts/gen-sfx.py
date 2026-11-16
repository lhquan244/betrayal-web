# Procedurally generates the sound effects in public/sfx (CC0 — made for this project, no third-party samples).
# Usage: python3 scripts/gen-sfx.py
import wave, struct, math, random, os
R = 22050
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'sfx')
def save(name, xs):
    m = max(1e-6, max(abs(x) for x in xs)); xs = [x / m * 0.85 for x in xs]
    with wave.open(os.path.join(OUT, name), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(R)
        w.writeframes(b''.join(struct.pack('<h', int(x * 32767)) for x in xs))
random.seed(7)
n = int(R * 0.75); xs = [0.0] * n                      # dice: clicky knocks
for k in range(9):
    st = int(R * (0.03 + k * 0.07 + random.random() * 0.03)); f = 1800 + random.random() * 1600
    for i in range(int(R * 0.05)):
        if st + i < n: xs[st + i] += (random.random() * 2 - 1) * math.exp(-i / (R * 0.006)) * 0.7 + math.sin(2 * math.pi * f * i / R) * math.exp(-i / (R * 0.01)) * 0.5
save('dice.wav', xs)
n = int(R * 0.45); xs = []; y = 0                       # card: swoosh + snap
for i in range(n):
    t = i / R; a = 0.02 + 0.5 * t; y = y + (random.random() * 2 - 1 - y) * a
    xs.append(y * math.sin(math.pi * min(1, t / 0.35)) * (1 if t < 0.35 else 0))
for i in range(int(R * 0.03)): xs[int(R * 0.36) + i] += (random.random() * 2 - 1) * math.exp(-i / (R * 0.004))
save('card.wav', xs)
n = int(R * 0.5); xs = []                               # attack: thump + hit
for i in range(n):
    t = i / R; f = 120 * math.exp(-t * 6) + 45
    xs.append(math.sin(2 * math.pi * f * t) * math.exp(-t * 7) + (random.random() * 2 - 1) * math.exp(-t * 30) * 0.8)
save('attack.wav', xs)
n = int(R * 2.6); xs = []; y = 0                        # haunt: thunder + drone
for i in range(n):
    t = i / R; y = y + (random.random() * 2 - 1 - y) * 0.04
    th = y * 6 * (math.exp(-t * 1.6)) * (1 if t > 0.05 else t / 0.05)
    dr = (math.sin(2 * math.pi * 55 * t) + 0.6 * math.sin(2 * math.pi * 58.3 * t) + 0.3 * math.sin(2 * math.pi * 82.4 * t)) * min(1, t / 0.8) * math.exp(-max(0, t - 1.6) * 2) * 0.35
    xs.append(th + dr)
save('haunt.wav', xs)
n = int(R * 0.6)                                        # ping: "your roll"
save('ping.wav', [math.sin(2 * math.pi * 880 * i / R) * math.exp(-i / (R * 0.15)) + 0.4 * math.sin(2 * math.pi * 1320 * i / R) * math.exp(-i / (R * 0.1)) for i in range(n)])
