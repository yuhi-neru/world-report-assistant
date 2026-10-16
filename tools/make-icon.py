from pathlib import Path
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parents[1]
image = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
d = ImageDraw.Draw(image)
d.rounded_rectangle((4, 4, 252, 252), radius=52, fill='#183b36')
d.ellipse((47, 47, 209, 209), outline='#d5e6c5', width=5)
d.ellipse((60, 60, 196, 196), outline='#527b61', width=2)
d.polygon([(157, 70), (147, 145), (99, 187), (109, 112)], fill='#d5e6c5')
d.polygon([(157, 70), (147, 145), (109, 112)], fill='#ffffff')
d.line([(128, 31), (128, 40)], fill='#c1d7ae', width=4)
d.line([(128, 216), (128, 225)], fill='#c1d7ae', width=4)
d.line([(31, 128), (40, 128)], fill='#c1d7ae', width=4)
d.line([(216, 128), (225, 128)], fill='#c1d7ae', width=4)
target = root/'src-tauri/icons'
target.mkdir(parents=True, exist_ok=True)
image.save(target/'icon.png')
image.save(target/'icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
print('Installer icon created')
