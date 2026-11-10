from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    errs=[]
    for theme,w in (('light',1440),('dark',1440),('light',420)):
        pg=b.new_page(viewport={'width':w,'height':900}); pg.on('pageerror',lambda e:errs.append('PAGEERROR '+str(e)))
        pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'ERR_' not in m.text and 'Failed to load resource' not in m.text else None)
        pg.goto('http://localhost:8898/'); pg.evaluate(f"localStorage.setItem('riverport-theme','{theme}')"); pg.goto('http://localhost:8898/#ejecutivo'); pg.reload(); pg.wait_for_timeout(1500)
        pg.screenshot(path=f'/tmp/e_{theme}_{w}.png',full_page=True)
        if theme=='light' and w==1440:
            pg.click('.tile.t-navy'); pg.wait_for_timeout(300); pg.screenshot(path='/tmp/e_modal.png')
        pg.close()
    print('ERRORS',errs); b.close()
