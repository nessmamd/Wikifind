from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split
from sklrean.metrics import mean_squared_error, r2_score
import networkx as nx 
import numpy as np
import pandas as pd
from itertools import combinations
import random 

def build_graph(articles):
    # this is building the graph from the links of articles we have
    G = nx.DiGraph()

    for title, data in articles.items(): 
        G.add_node(title)
        for link in data['links']:
            if link in articles:
                G.add_edge(title, link)
    return G

def calculate_category_divergence(cats1, cats2):
    #this is figuring out how far from the extract it is
    set1 = set(cats1)
    set2 = set(cats2)

    if len(set1) == 0 and len(set2) == 0:
        return 0.0 

    intersection = len(set1 & set2)
    union = len(set1 | set2)
    
    return 1 - (intersection / union) if union > 0 else 1.0

def extract_features(G, articles, start, end):
    #important to compare categories
    start_data = articles.get(start, {})
    end_data = articles.get(end, {})

    start_cats = start_data.get('categories', [])
    end_cats = end_data.get('categories', [])

    features = {}

    features['category_divergence'] = calculate_category_divergence(start_cats, end_cats)
    features['num_shared_categories'] = len(set(start_cats) & set(end_cats))
    features['num_start_categories'] = len(start_cats)
    features['num_end_categories'] = len(end_cats)

    if start in G and end in G:
        try:
            path_length = nx.shortest_path_length(G, start, end)
        except nx.NetworkXNoPath:
            path_length = 999
        
        features['shortest_path_length'] = path_length
        features['start_out_degree'] = G.out_degree(start)
        features['end_in_degree'] = G.in_degree(end)
        
        features['start_pagerank'] = 0.0 
        features['end_pagerank'] = 0.0
    else:
        features['shortest_path_length'] = 999
        features['start_out_degree'] = 0
        features['end_in_degree'] = 0
        features['start_pagerank'] = 0.0
        features['end_pagerank'] = 0.0
    
    features['title_length_diff'] = abs(len(start) - len(end))
    
    return features
