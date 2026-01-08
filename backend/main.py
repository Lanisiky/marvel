from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any
import pandas as pd
import networkx as nx
import networkx.algorithms.community as nx_comm
import os
import math
import random

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data") 

NODES_PATH = os.path.join(DATA_DIR, "message.csv")
RELS_PATH = os.path.join(DATA_DIR, "relation_message.csv")

app = FastAPI(title="漫威宇宙统一后端")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def clean_row(row):
    return {k: (None if isinstance(v, float) and math.isnan(v) else v) for k, v in row.items()}



# 模块 1
class SocialNetworkHandler:
    def __init__(self):
        self.nodes_data = []
        self.links_data = []
        self.movies_data = []
        self.is_ready = False
        #self._init_data()

    def _init_data(self):
        """初始化计算：读取数据，计算 PageRank 和 社群"""

        # 1. 构建图
        df_rels = pd.read_csv(RELS_PATH)
        G = nx.Graph()

        # 统计边权重
        edge_weights = {}
        for _, row in df_rels.iterrows():
            s, t = str(row['subject']).strip(), str(row['object']).strip()
            if not s or not t: continue
            if s > t: s, t = t, s
            edge_weights[(s, t)] = edge_weights.get((s, t), 0) + 1

        for (s, t), w in edge_weights.items():
            G.add_edge(s, t, weight=w)

        if len(G.nodes) == 0:
            return

        # 2.后端计算
        # 2.1 PageRank
        pagerank = nx.pagerank(G, weight='weight')

        # 2.2 度中心性
        degree = dict(G.degree())

        # 2.3 社群划分 (Greedy Modularity 算法)
        communities_generator = nx_comm.greedy_modularity_communities(G)
        node_community_map = {}
        for idx, community_set in enumerate(communities_generator):
            comm_id = idx % 10  
            for node in community_set:
                node_community_map[node] = comm_id

        # 3. 组装节点数据 
        node_details = {}
        if os.path.exists(NODES_PATH):
            try:
                df_nodes = pd.read_csv(NODES_PATH, header=None, names=['id', 'name', 'status', 'species'])
                for _, row in df_nodes.iterrows():
                    node_details[str(row['name'])] = row.to_dict()
            except:
                pass

        self.nodes_data = []
        # 建立 name -> int_id 的映射
        name_to_id = {}

        for i, name in enumerate(G.nodes()):
            name_to_id[name] = i

            # 模拟数据 
            d = degree.get(name, 0)
            base_screen_time = d * 15 + random.randint(10, 50)

            self.nodes_data.append({
                "id": i,  # 数字ID
                "name": name,  # 显示名称
                "community": node_community_map.get(name, 0),
                "pagerank": pagerank.get(name, 0) * 1000,  
                "degree": d,
                "screenTime": base_screen_time,
                "firstAppearance": random.randint(2008, 2023),
                "alignment": "hero"  # 默认值
            })

        # 4. 组装关系数据 
        self.links_data = []
        for (s, t), w in edge_weights.items():
            if s in name_to_id and t in name_to_id:
                self.links_data.append({
                    "source": name_to_id[s],
                    "target": name_to_id[t],
                    "weight": w
                })

        # 5. 组装电影数据 
        self.movies_data = [
            {"id": 1, "name": "钢铁侠1", "year": 2008},
            {"id": 2, "name": "雷神", "year": 2011},
            {"id": 3, "name": "复仇者联盟", "year": 2012},
            {"id": 4, "name": "银河护卫队", "year": 2014},
            {"id": 5, "name": "复仇者联盟2", "year": 2015},
            {"id": 6, "name": "美国队长3", "year": 2016},
            {"id": 7, "name": "复仇者联盟3", "year": 2018},
            {"id": 8, "name": "复仇者联盟4", "year": 2019},
        ]

        self.is_ready = True
        print(f"计算完成: {len(self.nodes_data)} 角色, {len(self.links_data)} 关系")

    def get_full_data(self) -> Dict[str, Any]:
        if not self.is_ready:
            # 尝试重新初始化
            self._init_data()
            if not self.is_ready:
                return {"nodes": [], "links": [], "movies": []}

        return {
            "nodes": self.nodes_data,
            "links": self.links_data,
            "movies": self.movies_data
        }


# 初始化社交网络处理器
social_handler = SocialNetworkHandler()



# 模块 2
class CharacterGraphHandler:
    def __init__(self, csv_path: str):
        self.graph = nx.Graph()
        self.character_id_map = {}
        self.next_id = 1
        self._load_data_from_csv(csv_path)

    def _load_data_from_csv(self, csv_path: str):
        if not os.path.exists(csv_path): return
        try:
            df = pd.read_csv(csv_path, encoding="utf-8", skip_blank_lines=True)
            if not all(col in df.columns for col in ["subject", "object", "relation"]): return
            for _, row in df.iterrows():
                char1, char2 = str(row["subject"]).strip(), str(row["object"]).strip()
                rel = str(row["relation"]).strip()
                if not char1 or not char2: continue
                self._add_character_node(char1)
                self._add_character_node(char2)
                if not self.graph.has_edge(char1, char2):
                    self.graph.add_edge(char1, char2, type=rel)
            print(f"构建完成: {len(self.graph.nodes())} 节点")
        except Exception as e:
            print(f"构建异常: {str(e)}")

    def _add_character_node(self, name: str):
        if name not in self.character_id_map:
            self.character_id_map[name] = str(self.next_id)
            self.next_id += 1
            self.graph.add_node(name, name=name)

    def get_shortest_path(self, start: str, end: str):
        if start not in self.graph or end not in self.graph:
            raise HTTPException(404, "角色不存在")
        try:
            path = nx.shortest_path(self.graph, start, end)
        except nx.NetworkXNoPath:
            raise HTTPException(404, "无路径")
        return {
            "nodes": [{"id": self.character_id_map[c], "name": c} for c in path],
            "rels": [{"source": self.character_id_map[path[i]], "target": self.character_id_map[path[i + 1]],
                      "type": self.graph[path[i]][path[i + 1]].get("type")} for i in range(len(path) - 1)]
        }

    def get_names(self):
        return sorted(list(self.graph.nodes()))

    def get_nodes(self):
        return [{"id": self.character_id_map[c], "name": c} for c in self.graph.nodes()]

    def get_rels(self):
        return [{"source": self.character_id_map[u], "target": self.character_id_map[v], "type": d.get("type")} for
                u, v, d in self.graph.edges(data=True)]


graph_handler = CharacterGraphHandler(RELS_PATH)


# API 路由
# 1. 社交网络分析接口 
@app.get("/api/social-network/data")
def get_social_network_data():
    """获取包含 PageRank、社群等计算结果的完整数据"""
    if hasattr(social_handler, 'ensure_initialized'):
        social_handler.ensure_initialized()
    return social_handler.get_full_data()


# 2. 基础图谱接口 
class PathRequest(BaseModel):
    start: str
    end: str


# Pandas 数据加载
try:
    nodes_df = pd.read_csv(NODES_PATH, header=None, names=['id', 'name', 'status', 'species']) if os.path.exists(
        NODES_PATH) else pd.DataFrame()
    rels_df = pd.read_csv(RELS_PATH) if os.path.exists(RELS_PATH) else pd.DataFrame()
except:
    nodes_df, rels_df = pd.DataFrame(), pd.DataFrame()


@app.get("/api/init/{node_id}")
def get_init_node(node_id: str):
    node = nodes_df[(nodes_df['id'] == node_id) | (nodes_df['name'] == node_id)]
    if node.empty:
        if node_id in graph_handler.graph:
            return {"nodes": [{"id": graph_handler.character_id_map[node_id], "name": node_id}], "links": []}
        raise HTTPException(404, "Not found")
    return {"nodes": [clean_row(node.iloc[0].to_dict())], "links": []}


@app.get("/api/expand/{node_id}")
def get_neighbors(node_id: str):
    related = rels_df[(rels_df['subject'] == node_id) | (rels_df['object'] == node_id)]
    links = []
    neighbor_ids = set()
    for _, row in related.iterrows():
        r = clean_row(row.to_dict())
        links.append({"source": r['subject'], "target": r['object'], "type": r['relation']})
        neighbor_ids.add(r['object'] if r['subject'] == node_id else r['subject'])

    nodes_list = []
    if neighbor_ids:
        found = nodes_df[nodes_df['id'].isin(neighbor_ids)]
        nodes_list = [clean_row(r) for r in found.to_dict(orient='records')]
        for mid in (neighbor_ids - set(n['id'] for n in nodes_list)):
            nodes_list.append({"id": mid, "name": mid})

    return {"nodes": nodes_list, "links": links}


@app.get("/api/characters")
def api_get_characters(): return graph_handler.get_names()


@app.get("/api/all-nodes")
def api_get_all_nodes(): return graph_handler.get_nodes()


@app.get("/api/all-rels")
def api_get_all_rels(): return graph_handler.get_rels()


@app.post("/api/shortest-path")
def api_shortest_path(req: PathRequest):
    return graph_handler.get_shortest_path(req.start, req.end)


if __name__ == "__main__":
    import uvicorn

    print("后端服务启动中... Port: 3001")
    uvicorn.run(app, host="0.0.0.0", port=3001)

