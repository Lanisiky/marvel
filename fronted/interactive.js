(function() {
    let svg, g, simulation, legendContainer; 
    let nodes = [];
    let links = [];
    let width, height;
    const containerId = "#interactive-container";
    
    window.initInteractive = async function() {
        const container = document.querySelector(containerId);
        width = container.clientWidth;
        height = container.clientHeight;

        if (svg) svg.remove(); 

        if (legendContainer) legendContainer.remove();

        svg = d3.select(containerId).append("svg")
            .attr("width", width)
            .attr("height", height)
            .call(d3.zoom().on("zoom", (event) => {
                g.attr("transform", event.transform);
            }));

        g = svg.append("g");
        
        // 颜色映射
        const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

        legendContainer = d3.select(containerId)
            .append("div")
            .attr("class", "interactive-legend")
            .style("position", "absolute")
            .style("top", "20px")
            .style("right", "20px")
            .style("z-index", "100") 
            .style("background", "rgba(255, 255, 255, 0.9)") 
            .style("padding", "12px 15px")
            .style("border-radius", "8px")
            .style("box-shadow", "0 2px 8px rgba(0,0,0,0.1)")
            .style("max-height", "60vh") 
            .style("overflow-y", "auto")
            .style("font-size", "14px");

        legendContainer.append("div")
            .text("颜色对应表")
            .style("margin-bottom", "10px")
            .style("border-bottom", "1px solid #eee")
            .style("padding-bottom", "6px")
            .style("color", "#2c3e50")
            .style("font-weight", "600");

        simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collide", d3.forceCollide().radius(30));

        // 请求初始节点 
        try {
            const response = await fetch("/api/init/tonys");
            const data = await response.json();
            
            nodes = data.nodes;
            links = data.links;
            
            if (nodes.length > 0) {
                nodes[0].fx = width / 2;
                nodes[0].fy = height / 2;
            }
           
            updateLegend(colorScale); 
            updateGraph(colorScale); 
        } catch (e) {
            console.error("Tab 3 Init Error:", e);
        }

        function updateGraph(colorScale) {
            const link = g.selectAll(".link")
                .data(links, d => d.source.id + "-" + d.target.id)
                .join("line")
                .attr("class", "link");

            const node = g.selectAll(".node")
                .data(nodes, d => d.id)
                .join(enter => {
                    const nodeG = enter.append("g")
                        .attr("class", "node")
                        .call(d3.drag()
                            .on("start", dragstarted)
                            .on("drag", dragged)
                            .on("end", dragended));

                    nodeG.append("circle")
                        .attr("r", 0)
                        .attr("fill", d => d.status === 'deceased' ? '#555' : colorScale(d.species))
                        .transition().duration(500).attr("r", 20);

                    nodeG.append("text")
                        .attr("dy", 30)
                        .attr("text-anchor", "middle")
                        .text(d => d.name);
                    
                    // 双击展开
                    nodeG.on("dblclick", (event, d) => handleNodeClick(event, d, colorScale)); 
                    return nodeG;
                });

            simulation.nodes(nodes).on("tick", () => {
                link
                    .attr("x1", d => d.source.x)
                    .attr("y1", d => d.source.y)
                    .attr("x2", d => d.target.x)
                    .attr("y2", d => d.target.y);
                node.attr("transform", d => `translate(${d.x},${d.y})`);
            });

            simulation.force("link").links(links);
            simulation.alpha(1).restart();
        }

        async function handleNodeClick(event, d, colorScale) {
            delete d.fx; delete d.fy; 
            try {
                const res = await fetch(`/api/expand/${d.id}`);
                const newData = await res.json();
                
                const existingIds = new Set(nodes.map(n => n.id));
                let hasNew = false;

                newData.nodes.forEach(n => {
                    if (!existingIds.has(n.id)) {
                        n.x = d.x; n.y = d.y; // 从父节点弹出
                        nodes.push(n);
                        hasNew = true;
                    }
                });

                const linkSet = new Set(links.map(l => `${l.source.id}-${l.target.id}`));
                newData.links.forEach(l => {
                    const linkKey = `${l.source}-${l.target}`;
                    const reverseKey = `${l.target}-${l.source}`;
                    if (!linkSet.has(linkKey) && !linkSet.has(reverseKey)) {
                        links.push(l);
                        linkSet.add(linkKey);
                    }
                });
                
                if (hasNew) {
                    updateGraph(colorScale);
                    updateLegend(colorScale); 
                }
                
            } catch (error) { console.error(error); }
        }

        function updateLegend(colorScale) {
            const uniqueSpecies = [...new Set(nodes.map(d => d.species))];
            
            legendContainer.selectAll(".legend-species-item").remove();
            
            uniqueSpecies.forEach(species => {
                const item = legendContainer.append("div")
                    .attr("class", "legend-species-item")
                    .style("display", "flex")
                    .style("align-items", "center")
                    .style("gap", "8px")
                    .style("margin", "6px 0");

                // 颜色块
                item.append("div")
                    .style("width", "16px")
                    .style("height", "16px")
                    .style("border-radius", "4px")
                    .style("background", colorScale(species));

                // 种族名称
                item.append("div")
                    .text(species)
                    .style("color", "#34495e")
                    .style("white-space", "nowrap"); // 防止种族名换行
            });

            legendContainer.selectAll(".legend-deceased-item").remove();
            const deceasedItem = legendContainer.append("div")
                .attr("class", "legend-deceased-item")
                .style("display", "flex")
                .style("align-items", "center")
                .style("gap", "8px")
                .style("margin-top", "10px")
                .style("padding-top", "8px")
                .style("border-top", "1px dashed #eee");

            deceasedItem.append("div")
                .style("width", "16px")
                .style("height", "16px")
                .style("border-radius", "4px")
                .style("background", "#555");

            deceasedItem.append("div")
                .text("已故角色")
                .style("color", "#e74c3c") 
                .style("font-weight", "500");
        }

        // 拖拽相关函数
        function dragstarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
        }
        function dragged(event, d) {
            d.fx = event.x; d.fy = event.y;
        }
        function dragended(event, d) {
            if (!event.active) simulation.alphaTarget(0);
        }
    };

    // 窗口大小调整
    window.resizeInteractive = function() {
        if(svg) {
            const container = document.querySelector(containerId);
            const w = container.clientWidth;
            const h = container.clientHeight;
            svg.attr("width", w).attr("height", h);
            if(simulation) simulation.force("center", d3.forceCenter(w / 2, h / 2));
            simulation.alpha(0.3).restart();
        } else {
            window.initInteractive();
        }
    }

    window.addEventListener("load", () => {
        setTimeout(() => {
        }, 500);
    });

})();