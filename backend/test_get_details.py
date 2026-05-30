import asyncio
import logging
from app.services.fanpay_client import FanpayClient

logging.basicConfig(level=logging.INFO)

async def test():
    golden_key = "0qyj1jlmwc2hoze7ovy08ywlg1rag0km"
    client = FanpayClient(golden_key=golden_key, proxy_url="")
    
    is_valid, username, cookies = await client.verify_session()
    if is_valid:
        res1 = await client.get_lot_details("69846989")
        print(f"Details 69846989 success: {bool(res1)}")
        if res1:
            print(f"Keys: {res1.keys()}")
            print(f"Price: {res1.get('price')}")
            print(f"Native auto delivery: {res1.get('native_auto_delivery_enabled')}")
            
        res2 = await client.get_lot_details("69888663")
        print(f"Details 69888663 success: {bool(res2)}")
        if res2:
            print(f"Keys: {res2.keys()}")
            print(f"Price: {res2.get('price')}")
            print(f"Native auto delivery: {res2.get('native_auto_delivery_enabled')}")

if __name__ == "__main__":
    asyncio.run(test())
