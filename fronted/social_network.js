(function() {
    // 全局状态管理
    window.snCharacters = [];
    window.snRelationships = [];
    window.snMovies = [];
    window.snCharacterAppearances = {};
    window.snSelectedCharacterId = 0;
    window.snNodeSizeMode = "pagerank";
    window.snSimulation = null;
    window.snSvg = null;
    window.snG = null;
    window.snLink = null;
    window.snNode = null;
    window.snLabel = null;
    window.snSearchTimeout = null;
    window.snTransform = d3.zoomIdentity;
    window.snShowBoundary = false;
    window.snBoundaryBox = null;
    window.snInitialized = false;

    // 社群颜色/名称映射
    window.snCommunityColors = {
        0: "#e74c3c", // 复仇者联盟 - 红色
        1: "#9b59b6", // 银河护卫队 - 紫色
        2: "#2ecc71", // 瓦坎达 - 绿色
        3: "#3498db", // 魔法系 - 蓝色
        4: "#f39c12", // 反派 - 橙色
        5: "#f1c40f", // 神域 - 黄色
        6: "#1abc9c", // X战警 - 青色
        7: "#ff69b4", // 神奇四侠 - 粉色
        8: "#8B4513", // 捍卫者联盟 - 棕色
        9: "#00ffff"  // 宇宙力量 - 青绿色
    };

    window.snCommunityNames = {
        0: "复仇者联盟", 1: "银河护卫队", 2: "瓦坎达", 3: "魔法系", 4: "反派",
        5: "神域", 6: "X战警", 7: "神奇四侠", 8: "捍卫者联盟", 9: "宇宙力量"
    };

    window.initSocialNetwork = async function() {
        if (window.snInitialized) return;

        const loading = document.getElementById('loading');
        if(loading) loading.style.display = 'block';

        try {
            console.log("正在请求后端社交分析 API...");
            const response = await fetch('/api/social-network/data');
            
            if (!response.ok) {
                throw new Error(`API 请求失败: ${response.status}`);
            }

            const data = await response.json();
            
            window.snCharacters = data.nodes;
            window.snRelationships = data.links;
            window.snMovies = data.movies;

            if (!window.snCharacters || window.snCharacters.length === 0) {
                throw new Error("后端返回的节点数据为空，请检查 relation_message.csv 是否存在");
            }

            window.snCharacters.forEach(char => {
                window.snCharacterAppearances[char.id] = [];
                window.snMovies.forEach(movie => {
                    if (movie.year >= char.firstAppearance) {
                        const baseTime = char.screenTime / 15;
                        let time = Math.random() * baseTime * 0.8 + baseTime * 0.2;
  
                        if (char.pagerank > 5) time *= 1.2;
                        window.snCharacterAppearances[char.id].push(time);
                    } else {
                        window.snCharacterAppearances[char.id].push(0);
                    }
                });
            });

            window.snCreateLegend();
            window.snInitForceGraph();
            window.snInitTimelineChart();
            window.snBindEvents();

            window.snInitialized = true;
            console.log("Social Network Analysis Initialized (API Mode)");

        } catch (error) {
            console.error("社交网络分析数据加载失败：", error);
            const modalBody = document.getElementById('modalBody');
            const resultModal = document.getElementById('resultModal');
            if(modalBody && resultModal) {
                modalBody.innerHTML = `<span style="color:#e74c3c;">错误：</span>${error.message}<br>请确认后端服务已启动。`;
                resultModal.classList.add('show');
                resultModal.style.display = 'flex';
            }
        } finally {
            if(loading) loading.style.display = 'none';
        }
    };

    window.snCreateLegend = function() {
        const legendContainer = d3.select("#sn-graph-legend");
        legendContainer.html("");
        
        Object.keys(window.snCommunityColors).forEach(commId => {
            const legendItem = legendContainer.append("div").attr("class", "sn-legend-item");
            legendItem.append("div")
                .attr("class", "sn-legend-color")
                .style("background-color", window.snCommunityColors[commId]);
            legendItem.append("span").text(window.snCommunityNames[commId]);
        });
    };

    window.snGetNodeRadius = function(d) {
        switch(window.snNodeSizeMode) {
            case "pagerank": return 4 + d.pagerank * 1.5;
            case "degree": return 3 + d.degree * 0.8;
            case "time": return 3 + d.screenTime / 80;
            default: return 4 + d.pagerank * 1.5;
        }
    };

    window.snInitForceGraph = function() {
        const container = document.getElementById('sn-force-graph');
        const containerWidth = container.clientWidth - 40; 
        const containerHeight = container.clientHeight - 120; 
        
        d3.select("#sn-graph-vis").html("");
        
        window.snSvg = d3.select("#sn-graph-vis")
            .append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .attr("viewBox", [0, 0, containerWidth, containerHeight])
            .style("display", "block"); // 消除底部白边
        
        // 边界框
        window.snBoundaryBox = window.snSvg.append("rect")
            .attr("class", "sn-boundary-box")
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", containerWidth)
            .attr("height", containerHeight)
            .style("display", window.snShowBoundary ? "block" : "none");
        
        window.snG = window.snSvg.append("g");
        
        // 力模拟
        window.snSimulation = d3.forceSimulation(window.snCharacters)
            .force("link", d3.forceLink(window.snRelationships).id(d => d.id).distance(d => 70 - d.weight * 3).strength(d => d.weight * 0.04))
            .force("charge", d3.forceManyBody().strength(-120).distanceMax(250))
            .force("center", d3.forceCenter(containerWidth / 2, containerHeight / 2))
            .force("collision", d3.forceCollide().radius(d => window.snGetNodeRadius(d) + 6).strength(0.9))
            .force("x", d3.forceX(containerWidth / 2).strength(0.06))
            .force("y", d3.forceY(containerHeight / 2).strength(0.06))
            .alphaDecay(0.02)
            .alphaMin(0.001);
        
        // 连线
        window.snLink = window.snG.append("g")
            .selectAll("line")
            .data(window.snRelationships)
            .enter()
            .append("line")
            .attr("stroke", "#bdc3c7")
            .attr("stroke-width", d => Math.sqrt(d.weight) * 0.8)
            .attr("stroke-opacity", 0.5);
        
        // 节点
        window.snNode = window.snG.append("g")
            .selectAll("circle")
            .data(window.snCharacters)
            .enter()
            .append("circle")
            .attr("r", d => window.snGetNodeRadius(d))
            .attr("fill", d => window.snCommunityColors[d.community])
            .attr("stroke", d => d.id === window.snSelectedCharacterId ? "#e74c3c" : "#fff")
            .attr("stroke-width", d => d.id === window.snSelectedCharacterId ? 3 : 1)
            .call(d3.drag()
                .on("start", window.snDragStarted)
                .on("drag", window.snDragged)
                .on("end", window.snDragEnded));
        
        // 标签
        window.snLabel = window.snG.append("g")
            .selectAll("text")
            .data(window.snCharacters.filter(d => d.pagerank > 4 || d.id === window.snSelectedCharacterId))
            .enter()
            .append("text")
            .attr("class", "sn-node-label")
            .text(d => d.name)
            .attr("text-anchor", "middle")
            .attr("dy", d => -window.snGetNodeRadius(d) - 5)
            .attr("font-size", d => Math.max(9, window.snGetNodeRadius(d) / 3.5))
            .style("pointer-events", "none")
            .style("fill", "#333")
            .style("text-shadow", "0 1px 2px white");
        
        // 事件
        window.snNode.on("mouseover", function(event, d) {
            d3.select(this).attr("stroke", "#e74c3c").attr("stroke-width", 3);
            window.snShowTooltip(event, d);
        })
        .on("mouseout", function(event, d) {
            if (d.id !== window.snSelectedCharacterId) {
                d3.select(this).attr("stroke", "#fff").attr("stroke-width", 1);
            }
            d3.select(".sn-tooltip").style("opacity", 0);
        })
        .on("click", function(event, d) {
            window.snSelectedCharacterId = d.id;
            window.snUpdateSelectedCharacter(d.name);
            window.snUpdateTimelineChart(d.id);
            window.snUpdateSelectedInfo(d);
            window.snNode.attr("stroke", n => n.id === d.id ? "#e74c3c" : "#fff")
                .attr("stroke-width", n => n.id === d.id ? 3 : 1);
        });
        
        window.snSimulation.on("tick", () => {
            window.snLink
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);
            
            window.snNode
                .attr("cx", d => d.x)
                .attr("cy", d => d.y);
            
            window.snLabel
                .attr("x", d => d.x)
                .attr("y", d => d.y);
        });
        
        // 缩放
        const zoom = d3.zoom()
            .scaleExtent([0.2, 3])
            .on("zoom", (event) => {
                window.snTransform = event.transform;
                window.snG.attr("transform", window.snTransform);
            });
        window.snSvg.call(zoom);
    };

    // 拖拽相关
    window.snDragStarted = function(event, d) {
        if (!event.active) window.snSimulation.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
    };
    
    window.snDragged = function(event, d) {
        d.fx = event.x; d.fy = event.y;
    };
    
    window.snDragEnded = function(event, d) {
        if (!event.active) window.snSimulation.alphaTarget(0);
        d.fx = null; d.fy = null;
    };

    window.snShowTooltip = function(event, d) {
        let tooltip = d3.select(".sn-tooltip");
        if(tooltip.empty()) {
            tooltip = d3.select("body").append("div").attr("class", "sn-tooltip");
        }
        
        tooltip.style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 10) + "px")
            .html(`
                <div><strong>${d.name}</strong></div>
                <div>阵营: ${window.snCommunityNames[d.community]}</div>
                <div>PageRank: ${d.pagerank.toFixed(2)}</div>
            `)
            .transition().duration(100).style("opacity", 1);
    };

    window.snUpdateSelectedCharacter = function(name) {
        d3.select("#sn-selected-character").text(`当前选中: ${name}`);
        d3.select("#sn-timeline-character").text(name);
    };

    window.snInitTimelineChart = function() {
        const defaultChar = window.snCharacters.find(c => c.id === window.snSelectedCharacterId) || window.snCharacters[0];
        if (defaultChar) {
            window.snUpdateSelectedCharacter(defaultChar.name);
            window.snUpdateTimelineChart(defaultChar.id);
            window.snUpdateSelectedInfo(defaultChar);
        }
    };

    window.snUpdateTimelineChart = function(characterId) {
        const container = document.getElementById('sn-timeline-vis');

        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight || 200; 
        const margin = { top: 20, right: 20, bottom: 60, left: 50 };
        
        d3.select("#sn-timeline-vis").html("");
        
        const character = window.snCharacters.find(c => c.id === characterId);
        if (!character) return;

        const svg = d3.select("#sn-timeline-vis")
            .append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .attr("viewBox", [0, 0, containerWidth, containerHeight]);
        
        const charData = window.snMovies.map((movie, i) => ({
            movie: movie.name,
            year: movie.year,
            screenTime: window.snCharacterAppearances[characterId] ? window.snCharacterAppearances[characterId][i] : 0
        })).filter(d => d.screenTime > 0);
        
        if (charData.length === 0) {
            svg.append("text").attr("x", containerWidth/2).attr("y", containerHeight/2)
               .attr("text-anchor", "middle").text("暂无出场数据").style("fill", "#999");
            return;
        }
        
        const xScale = d3.scaleBand()
            .domain(charData.map(d => d.movie))
            .range([margin.left, containerWidth - margin.right])
            .padding(0.3);
        
        const yScale = d3.scaleLinear()
            .domain([0, d3.max(charData, d => d.screenTime) * 1.1])
            .range([containerHeight - margin.bottom, margin.top]);
        
        // X轴
        svg.append("g")
            .attr("transform", `translate(0,${containerHeight - margin.bottom})`)
            .call(d3.axisBottom(xScale).tickValues(charData.filter((d,i)=>i%2===0).map(d=>d.movie)).tickSizeOuter(0))
            .selectAll("text")
            .attr("transform", "rotate(-30)")
            .style("text-anchor", "end")
            .style("font-size", "10px");
        
        // Y轴
        svg.append("g")
            .attr("transform", `translate(${margin.left},0)`)
            .call(d3.axisLeft(yScale).ticks(5));

        // 柱子
        svg.selectAll(".sn-timeline-bar")
            .data(charData)
            .enter()
            .append("rect")
            .attr("class", "sn-timeline-bar")
            .attr("x", d => xScale(d.movie))
            .attr("y", d => yScale(d.screenTime))
            .attr("width", xScale.bandwidth())
            .attr("height", d => containerHeight - margin.bottom - yScale(d.screenTime))
            .attr("fill", window.snCommunityColors[character.community]);
    };

    window.snUpdateSelectedInfo = function(character) {
        const container = d3.select("#sn-selected-info-container");
        container.html("");
        if (!character) return;
        
        container.append("h3").text("角色详情");
        container.append("p").html(`<strong>阵营:</strong> <span>${window.snCommunityNames[character.community]}</span>`);
        container.append("p").html(`<strong>Pagerank:</strong> <span>${character.pagerank.toFixed(3)}</span>`);
        container.append("p").html(`<strong>连接数:</strong> <span>${character.degree}</span>`);
        container.append("p").html(`<strong>总时长:</strong> <span>${Math.round(character.screenTime)} min</span>`);
    };

    window.snUpdateNodeSize = function() {
        if (!window.snNode) return;
        window.snNode.transition().duration(500).attr("r", d => window.snGetNodeRadius(d));
        window.snSimulation.force("collision", d3.forceCollide().radius(d => window.snGetNodeRadius(d) + 6).strength(0.9));
        window.snSimulation.alpha(0.3).restart();
    };

    window.snHighlightBridgeCharacters = function() {
        if (!window.snNode || !window.snLink || !window.snLabel) return;
        
        window.snCharacters.forEach(char => {
            char.bridgeScore = window.snRelationships.filter(r => {

                const sourceId = r.source.id !== undefined ? r.source.id : r.source;
                const targetId = r.target.id !== undefined ? r.target.id : r.target;
                
                const sourceNode = r.source.community !== undefined ? r.source : window.snCharacters.find(c => c.id === sourceId);
                const targetNode = r.target.community !== undefined ? r.target : window.snCharacters.find(c => c.id === targetId);

                if (!sourceNode || !targetNode) return false;
                
                if (sourceId === char.id) return targetNode.community !== char.community;
                if (targetId === char.id) return sourceNode.community !== char.community;
                return false;
            }).length;
        });
        
        const maxBridgeScore = d3.max(window.snCharacters, d => d.bridgeScore);
        const threshold = maxBridgeScore > 0 ? maxBridgeScore * 0.6 : 1; 
        
        window.snNode.attr("opacity", 0.1);
        window.snLink.attr("opacity", 0.05);
        
        window.snNode.filter(d => d.bridgeScore >= threshold)
            .attr("opacity", 1)
            .attr("stroke", "#2ecc71")
            .attr("stroke-width", 3);
        
        window.snLink.filter(r => {
             const s = r.source.id !== undefined ? r.source.id : r.source;
             const t = r.target.id !== undefined ? r.target.id : r.target;
             const sNode = window.snCharacters.find(c => c.id === s);
             const tNode = window.snCharacters.find(c => c.id === t);
             return (sNode && sNode.bridgeScore >= threshold) || (tNode && tNode.bridgeScore >= threshold);
        }).attr("opacity", 0.3);

        window.snLabel.attr("opacity", d => d.bridgeScore >= threshold ? 1 : 0.1);
        console.log(`高亮了桥梁角色 (阈值:${threshold})`);
    };

    window.snHighlightLeaderCharacters = function() {
        if (!window.snNode || !window.snLink || !window.snLabel) return;
        
        window.snCharacters.forEach(char => {
            char.leaderScore = window.snRelationships.filter(r => {
                const sourceId = r.source.id !== undefined ? r.source.id : r.source;
                const targetId = r.target.id !== undefined ? r.target.id : r.target;
                
                const sourceNode = r.source.community !== undefined ? r.source : window.snCharacters.find(c => c.id === sourceId);
                const targetNode = r.target.community !== undefined ? r.target : window.snCharacters.find(c => c.id === targetId);

                if (!sourceNode || !targetNode) return false;
   
                if (sourceId === char.id) return targetNode.community === char.community;
                if (targetId === char.id) return sourceNode.community === char.community;
                return false;
            }).length;
        });
        
        const communityLeaders = {};
        window.snCharacters.forEach(char => {
            if (!communityLeaders[char.community] || 
                char.leaderScore > communityLeaders[char.community].leaderScore) {
                communityLeaders[char.community] = char;
            }
        });
        const leaderIds = Object.values(communityLeaders).map(d => d.id);
        
        // 应用高亮样式
        window.snNode.attr("opacity", 0.1);
        window.snLink.attr("opacity", 0.05);
        
        window.snNode.filter(d => leaderIds.includes(d.id))
            .attr("opacity", 1)
            .attr("stroke", "#f39c12")
            .attr("stroke-width", 4);
        
        window.snLabel.attr("opacity", d => leaderIds.includes(d.id) ? 1 : 0.1);
        console.log("高亮了领袖角色:", leaderIds);
    };

    window.snResetHighlight = function() {
        if (!window.snNode || !window.snLink || !window.snLabel) return;
        window.snNode.attr("opacity", 1).attr("stroke", "#fff").attr("stroke-width", 1);

        if(window.snSelectedCharacterId) {
             window.snNode.filter(d => d.id === window.snSelectedCharacterId)
                .attr("stroke", "#e74c3c").attr("stroke-width", 3);
        }
        window.snLink.attr("opacity", 0.5);
        window.snLabel.attr("opacity", 1);
    };

    window.snBindEvents = function() {
        // 1. 节点大小切换
        d3.select("#sn-pagerank-btn").on("click", function(){ 
            window.snNodeSizeMode = "pagerank"; 
            d3.selectAll(".sn-controls button").classed("active", false);
            d3.select(this).classed("active", true);
            window.snUpdateNodeSize();
        });
        d3.select("#sn-degree-btn").on("click", function(){ 
            window.snNodeSizeMode = "degree"; 
            d3.selectAll(".sn-controls button").classed("active", false);
            d3.select(this).classed("active", true);
            window.snUpdateNodeSize();
        });
        d3.select("#sn-time-btn").on("click", function(){ 
            window.snNodeSizeMode = "time"; 
            d3.selectAll(".sn-controls button").classed("active", false);
            d3.select(this).classed("active", true);
            window.snUpdateNodeSize();
        });

        // 2. 边界切换
        d3.select("#sn-toggle-boundary").on("click", function() {
            window.snShowBoundary = !window.snShowBoundary;
            if (window.snBoundaryBox) window.snBoundaryBox.style("display", window.snShowBoundary ? "block" : "none");
            d3.select(this).text(window.snShowBoundary ? "隐藏边界" : "显示边界");
        });

        // 3. 重置视图 
        d3.select("#sn-reset-view").on("click", () => {
             // 清除搜索
             const searchInput = document.getElementById('sn-character-search');
             if(searchInput) searchInput.value = '';

             // 恢复高亮状态
             window.snResetHighlight();

             // 重置镜头
             window.snSimulation.alpha(1).restart();
             window.snSvg.transition().duration(750).call(d3.zoom().transform, d3.zoomIdentity);
        });
        
        // 4. 搜索框
        d3.select("#sn-character-search").on("input", function() {
            const val = this.value.toLowerCase();
            if (!val) {
                window.snResetHighlight();
                return;
            }
            window.snNode.attr("opacity", d => d.name.toLowerCase().includes(val) ? 1 : 0.1);
            window.snLink.attr("opacity", 0.1);
            window.snLabel.attr("opacity", d => d.name.toLowerCase().includes(val) ? 1 : 0.1);
        });
        
        // 5. 社群过滤按钮
        d3.selectAll(".sn-community-btn").on("click", function() {
            const commId = +this.dataset.community;
            window.snNode.attr("opacity", d => d.community === commId ? 1 : 0.1);
            window.snLink.attr("opacity", 0.1);
            window.snLabel.attr("opacity", d => d.community === commId ? 1 : 0.1);
        });
        
        // 6. 重置高亮按钮
        d3.select("#sn-reset-highlight").on("click", () => {
             window.snResetHighlight();
             const searchInput = document.getElementById('sn-character-search');
             if(searchInput) searchInput.value = '';
        });

        d3.select("#sn-highlight-bridges").on("click", window.snHighlightBridgeCharacters);
        d3.select("#sn-highlight-leaders").on("click", window.snHighlightLeaderCharacters);

        // 布局控制
        d3.select("#sn-center-graph").on("click", () => {
             window.snSimulation.force("center", d3.forceCenter(window.innerWidth/2, 500/2)); 
             window.snSimulation.alpha(1).restart();
        });
        d3.select("#sn-compact-graph").on("click", () => {
             window.snSimulation.force("charge", d3.forceManyBody().strength(-30));
             window.snSimulation.alpha(1).restart();
        });
        d3.select("#sn-spread-graph").on("click", () => {
             window.snSimulation.force("charge", d3.forceManyBody().strength(-300));
             window.snSimulation.alpha(1).restart();
        });
    };
    
    // 窗口调整
    window.snResizeGraph = function() {
        if (window.snInitialized && window.snSimulation) {
            window.snInitForceGraph(); 
            window.snInitTimelineChart();
        }
    }

})();