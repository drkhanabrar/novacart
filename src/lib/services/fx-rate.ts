let cache:{rate:number;expiresAt:number}|null=null;
export async function getUsdToInrRate(){
  const override=Number(process.env.USD_TO_INR_RATE||"");
  if(Number.isFinite(override)&&override>0)return override;
  if(cache&&cache.expiresAt>Date.now())return cache.rate;
  try{const r=await fetch("https://open.er-api.com/v6/latest/USD",{cache:"no-store"});const d=await r.json();const rate=Number(d?.rates?.INR);if(Number.isFinite(rate)&&rate>0){cache={rate,expiresAt:Date.now()+6*60*60*1000};return rate;}}catch{}
  return 90;
}
