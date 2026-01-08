(function() {
    let allNodes = [], allLinks = [];
    let pathNodes = [], pathLinks = [];
    let simulationStatic;

    let particleInterval; 
    let currentStartId = null;
    let currentEndId = null;
    
    const startSel = document.getElementById('start');
    const endSel = document.getElementById('end');
    const queryBtn = document.getElementById('query');
    const modal = document.getElementById('resultModal');
    const modalBody = document.getElementById('modalBody');
    const modalClose = document.querySelector('.modal-close');
    const loading = document.getElementById('loading');

    function showLoading() { loading.classList.add('show'); }
    function hideLoading() { loading.classList.remove('show'); }
    function showModal(html) { modalBody.innerHTML = html; modal.classList.add('show'); }
    
    modalClose.onclick = () => modal.classList.remove('show');
    window.onclick = (e) => { if (e.target == modal) modal.classList.remove('show'); }

    async function initData() {
        try {
            showLoading();
            // 1. 加载角色列表
            const charRes = await fetch('/api/characters');
            const chars = await charRes.json();
            const opts = chars.map(c => `<option value="${c}">${c}</option>`).join('');
            startSel.innerHTML = opts;
            endSel.innerHTML = opts;

            // 2. 加载全图数据
            const [nRes, lRes] = await Promise.all([
                fetch('/api/all-nodes'),
                fetch('/api/all-rels')
            ]);
            allNodes = await nRes.json();
            allLinks = await lRes.json();

            // 3. 渲染静态图 
            renderStaticGraph();
            
        } catch (e) {
            console.error(e);
            showModal("数据加载失败，请检查后端是否在 3001 端口启动");
        } finally {
            hideLoading();
        }
    }

    //Tab 1 
    function renderStaticGraph() {
        const container = document.getElementById('static-graph');
        const width = container.clientWidth;
        const height = container.clientHeight;

        d3.select("#static-graph").selectAll("*").remove();
        if (particleInterval) clearInterval(particleInterval);

        const svg = d3.select("#static-graph").append("svg")
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", [0, 0, width, height]);

        const contentGroup = svg.append("g");

        const zoom = d3.zoom()
            .scaleExtent([0.1, 5])
            .on("zoom", (event) => {
                contentGroup.attr("transform", event.transform);
            });

        svg.call(zoom).on("dblclick.zoom", null); 

        // 数据浅拷贝
        const nodes = allNodes.map(d => ({...d}));
        const links = allLinks.map(d => ({...d}));

        // 1. 连线样式
        const getLinkClass = (d) => {
            const dSource = d.source.id || d.source;
            const dTarget = d.target.id || d.target;

            const isPath = pathLinks.some(pl => {
                const matchForward = (pl.source === dSource && pl.target === dTarget);

                const matchReverse = (pl.source === dTarget && pl.target === dSource);
                
                return matchForward || matchReverse;
            });
            return isPath ? "link path-link" : "link";
        };
        
        // 2. 节点样式
        const getNodeClass = (d) => {
            if (d.name === currentStartId) return "node start-node"; 
            if (d.name === currentEndId) return "node end-node";     
            
            const isPath = pathNodes.some(pn => pn.id === d.id);
            return isPath ? "node path-node" : "node";
        };


        const link = contentGroup.append("g").selectAll("line")
            .data(links).join("line")
            .attr("class", "link"); 

        const particleGroup = contentGroup.append("g").attr("class", "particles");

        const node = contentGroup.append("g").selectAll("circle")
            .data(nodes).join("circle")
            .attr("r", 5)
            .attr("class", getNodeClass)
            .attr("fill", "#3498db")
            .call(d3.drag()
                .on("start", dragstart)
                .on("drag", dragging)
                .on("end", dragend));

        const labels = contentGroup.append("g").selectAll("text")
            .data(nodes).join("text")
            .text(d => d.name)
            .attr("class", "label")
            .attr("dx", 8).attr("dy", 3);

        simulationStatic = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(80))
            .force("charge", d3.forceManyBody().strength(-200))
            .force("center", d3.forceCenter(width / 2, height / 2));

        simulationStatic.on("tick", () => {
            link
                .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x).attr("y2", d => d.target.y)
                .attr("class", getLinkClass); 
            
            node
                .attr("cx", d => d.x).attr("cy", d => d.y)
                .attr("class", getNodeClass);

            labels.attr("x", d => d.x).attr("y", d => d.y);

            updateParticlesPosition(nodes);
        });

        if (pathLinks.length > 0) {
            const particleData = pathLinks.flatMap(rel => [
                { source: rel.source, target: rel.target, offset: 0 },
                { source: rel.source, target: rel.target, offset: 0.5 }
            ]);

            particleGroup.selectAll(".particle")
                .data(particleData)
                .join("circle")
                .attr("class", "particle")
                .attr("r", 4);

            particleInterval = setInterval(() => {
                particleData.forEach(p => {
                    p.offset += 0.015;
                    if (p.offset > 1) p.offset = 0;
                });
                updateParticlesPosition(nodes);
            }, 30);
        }

        function updateParticlesPosition(currentNodes) {
            if (!particleGroup) return;
            particleGroup.selectAll(".particle")
                .attr("cx", d => {
                    const sNode = currentNodes.find(n => n.id === d.source);
                    const tNode = currentNodes.find(n => n.id === d.target);
                    if (!sNode || !tNode) return 0;
                    return sNode.x + (tNode.x - sNode.x) * d.offset;
                })
                .attr("cy", d => {
                    const sNode = currentNodes.find(n => n.id === d.source);
                    const tNode = currentNodes.find(n => n.id === d.target);
                    if (!sNode || !tNode) return 0;
                    return sNode.y + (tNode.y - sNode.y) * d.offset;
                });
        }

        function dragstart(event, d) {
            if (!event.active) simulationStatic.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
        }
        function dragging(event, d) {
            d.fx = event.x; d.fy = event.y;
        }
        function dragend(event, d) {
            if (!event.active) simulationStatic.alphaTarget(0);
            d.fx = null; d.fy = null;
        }
    }

    queryBtn.onclick = async () => {
        const s = startSel.value;
        const e = endSel.value;
        if (s === e) return showModal("起点终点不能相同");

        currentStartId = s;
        currentEndId = e;

        try {
            showLoading();
            const res = await fetch('/api/shortest-path', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({start: s, end: e})
            });
            const data = await res.json();
            if(data.detail) throw new Error(data.detail);

            pathNodes = data.nodes;
            pathLinks = data.rels;
            
            renderStaticGraph();
            
            let detailsHtml = "";
            if (pathNodes.length > 0) {
                const pathSteps = [];
                for (let i = 0; i < pathNodes.length - 1; i++) {
                    const curr = pathNodes[i];
                    const next = pathNodes[i+1];
                    const rel = pathLinks[i];
                    const relType = rel ? rel.type : "related";
                    
                    pathSteps.push(`
                        <div class="path-detail-row">
                            ${curr.name} -[<span class="relation-tag">${relType}</span>]-> ${next.name}
                        </div>
                    `);
                }
                detailsHtml = pathSteps.join("");
            }

            showModal(`
                <div class="modal-success-title">查询成功!</div>
                <p><strong>路径长度:</strong> ${pathNodes.length - 1} 步</p>
                <p><strong>路径详情:</strong></p>
                <div style="max-height: 200px; overflow-y: auto; margin-top:10px;">
                    ${detailsHtml}
                </div>
                
            `);

        } catch (err) {
            pathNodes = []; pathLinks = [];
            currentStartId = null; currentEndId = null;
            renderStaticGraph();
            showModal(`<span style="color:red">查询失败:</span> ${err.message}`);
        } finally {
            hideLoading();
        }
    };


    window.addEventListener("resize", () => {
        renderStaticGraph();
    });

    initData();
})();