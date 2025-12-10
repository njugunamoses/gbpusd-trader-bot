#!/usr/bin/env python3
# (same as earlier demo engine, ODO note included)
import time, argparse, os, requests
import pandas as pd
import pandas_ta as ta
from datetime import datetime
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('--backend', default=os.getenv('BACKEND_URL', 'http://localhost:3000'))
parser.add_argument('--symbol', default='GBPUSD')
parser.add_argument('--interval', default='1m')
parser.add_argument('--poll', type=int, default=60)
args = parser.parse_args()

BACKEND = args.backend
SYMBOL = args.symbol
POLL = args.poll

def fetch_ohlc(symbol, limit=200):
    # ODO: Replace this synthetic generator with a real market data API
    now = pd.Timestamp.utcnow()
    rng = pd.date_range(end=now, periods=limit, freq='T')
    base = 1.20
    steps = np.cumsum(np.random.normal(scale=0.0005, size=limit))
    price = base + steps
    df = pd.DataFrame({'close': price}, index=rng)
    df['open'] = df['close'] + np.random.normal(scale=0.0001, size=limit)
    df['high'] = df[['open','close']].max(axis=1) + abs(np.random.normal(scale=0.0002,size=limit))
    df['low'] = df[['open','close']].min(axis=1) - abs(np.random.normal(scale=0.0002,size=limit))
    df['volume'] = 100 + np.random.randint(0,50,size=limit)
    return df

def compute_signals(df):
    df = df.copy()
    df['ema8'] = ta.ema(df['close'], length=8)
    df['ema50'] = ta.ema(df['close'], length=50)
    df['rsi'] = ta.rsi(df['close'], length=14)
    last = df.iloc[-1]
    prev = df.iloc[-2]
    signal = None
    reason = None
    trend = 'bull' if last['ema8'] > last['ema50'] else 'bear'
    if prev['ema8'] <= prev['ema50'] and last['ema8'] > last['ema50'] and last['rsi'] < 70:
        signal = 'buy'
        reason = 'ema_cross_up'
    elif prev['ema8'] >= prev['ema50'] and last['ema8'] < last['ema50'] and last['rsi'] > 30:
        signal = 'sell'
        reason = 'ema_cross_down'
    return signal, reason, float(last['close']), float(last['rsi']), trend

def post_alert(side, price, rsi):
    payload = {
        'symbol': f'FX:{SYMBOL}',
        'side': side,
        'price': price,
        'size': 0.01,
        'sl': None,
        'tp': None,
        'engine':'python_v1',
        'rsi': rsi,
        'time': datetime.utcnow().isoformat() + 'Z'
    }
    try:
        r = requests.post(BACKEND + '/webhook', json=payload, timeout=10)
        print('Posted alert', r.status_code, r.text)
    except Exception as e:
        print('Error posting alert', e)

if __name__ == '__main__':
    print('Starting Python signal engine — DEMO only (ODO: replace feed)')
    while True:
        try:
            df = fetch_ohlc(SYMBOL)
            signal, reason, price, rsi, trend = compute_signals(df)
            ts = datetime.utcnow().isoformat()
            print(f'[{ts}] trend={trend} signal={signal} price={price:.5f} rsi={rsi:.2f}')
            if signal:
                post_alert(signal, price, rsi)
        except Exception as e:
            print('Engine error:', e)
        time.sleep(POLL)
