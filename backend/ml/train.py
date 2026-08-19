import os, sys
import sqlite3
import pandas as pd
import pickle

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from model import compute_averages

conn = sqlite3.connect("../db.sqlite3")
df = pd.read_sql_query("SELECT * FROM meals_mealconsumptionlog", conn)
conn.close()

print(f"Loaded {df.shape[0]} rows")


averages = compute_averages(df)

print(f"Computed {averages.shape[0]} item/session/day-of-week averages")
print(averages.head(10))


with open("model.pkl", "wb") as f:
    pickle.dump(averages, f)

print("Saved model.pkl")