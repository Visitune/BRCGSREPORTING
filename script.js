// --- Fonction principale encapsulant toute la logique ---
(function () { // IIFE (Immediately Invoked Function Expression) pour éviter les conflits

// --- Variables Globales ---
let reportData = null;
let idCounter = 0;
let commentsVisible = false;
let groqApiKey = sessionStorage.getItem('groqApiKey') || '';
let templateModelData = null;

// --- Références DOM (déclarées, mais initialisées dans initializeApp) ---
let docxInput, jsonInput, loadDocxBtn, loadJsonBtn, saveJsonBtn, toggleCommentsBtn,
    statusElement, loadingElement, loadingMessageElement, outputContainer,
    docInfoElement, docStructureElement, sidebarNav, apiKeyInput, setApiKeyBtn;

// --- Configuration API ---
const GROQ_API_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama3-8b-8192";

// --- Fonctions Utilitaires ---
function generateId() {
    return `elem-${idCounter++}`;
}

function showLoading(message) {
    if (statusElement) statusElement.textContent = message;
    if (loadingMessageElement) loadingMessageElement.textContent = message;
    if (loadingElement) loadingElement.style.display = 'flex';
    if (outputContainer) outputContainer.style.display = 'none';
}

function hideLoading() {
    if (loadingElement) loadingElement.style.display = 'none';
    const reportDataExists = !!reportData;
    if (saveJsonBtn) saveJsonBtn.disabled = !reportDataExists;
    if (toggleCommentsBtn) toggleCommentsBtn.disabled = !reportDataExists;
    if (outputContainer) outputContainer.style.display = reportDataExists ? 'block' : 'none';
    if (reportDataExists && statusElement) {
        const source = reportData.metadata?.source === 'json' ? 'JSON' : 'DOCX';
        updateStatus(`Fichier ${source} chargé.`);
    }
}

function updateStatus(message, isError = false) {
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.style.color = isError ? 'red' : 'white';
    }
}

function clearReportDisplay() {
    if (docInfoElement) docInfoElement.innerHTML = '';
    if (docStructureElement) docStructureElement.innerHTML = '';
    if (sidebarNav) sidebarNav.innerHTML = '';
    reportData = null;
    idCounter = 0;
    commentsVisible = false;
    if (outputContainer) outputContainer.style.display = 'none';
    if (saveJsonBtn) saveJsonBtn.disabled = true;
    if (toggleCommentsBtn) toggleCommentsBtn.disabled = true;
    if (statusElement) updateStatus("Prêt.");
}

function findElementById(id, data = reportData) {
    if (!data || typeof data !== 'object') return null;
    if (data.id === id) return data;

    if (Array.isArray(data)) {
        for (const item of data) {
            const found = findElementById(id, item);
            if (found) return found;
        }
    } else {
        for (const key in data) {
            if (data.hasOwnProperty(key) && typeof data[key] === 'object') {
                const found = findElementById(id, data[key]);
                if (found) return found;
            }
        }
    }
    return null;
}

function findMaxId(data) {
    let maxId = 0;
    function traverse(obj) {
        if (obj && typeof obj === 'object') {
            if (obj.id && typeof obj.id === 'string' && obj.id.startsWith('elem-')) {
                const numPart = parseInt(obj.id.split('-')[1], 10);
                if (!isNaN(numPart) && numPart > maxId) {
                    maxId = numPart;
                }
            }
            if (Array.isArray(obj)) {
                obj.forEach(traverse);
            } else {
                Object.values(obj).forEach(traverse);
            }
        }
    }
    traverse(data);
    return maxId;
}

// --- Gestion de l'API IA ---
async function fetchAISuggestion(text, context = {}) {
    if (!groqApiKey) {
        alert("Clé API Groq non définie.");
        return null;
    }

    // Prompt optimisé avec le modèle JSON comme référence
    let prompt = `
Tu es un assistant expert en rédaction de rapports d'audit BRCGS.
Améliore la clarté, la concision et la qualité professionnelle du texte fourni.
Utilise un ton factuel, clair et professionnel.
Respecte strictement le style du modèle BRCGS standard.
Ne modifie pas le sens ou les faits présentés.
Ne génère pas de texte supplémentaire au-delà de l'amélioration demandée.
Ne réponds pas avec des explications, seulement avec le texte amélioré.

Texte à améliorer :
"${text}"

Contexte :
Titre du chapitre : ${context.chapterTitle || 'N/A'}
Type d'élément : ${context.elementType || 'N/A'}`;

    // Si le modèle est chargé, on peut l'ajouter comme exemple de style
    if (templateModelData) {
        prompt += `\n\nVoici un exemple de style souhaité extrait du modèle BRCGS :
Exemple de titre : "${templateModelData.chapters[0]?.title || 'N/A'}"
Exemple de texte : "${templateModelData.chapters[0]?.content?.[0]?.text?.substring(0, 100) || 'N/A'}..."`;
    }

    prompt += `\n\nTexte amélioré :`;

    try {
        const response = await fetch(GROQ_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Erreur API (${response.status}): ${errorData.error?.message}`);
        }

        const data = await response.json();
        const suggestion = data.choices[0]?.message?.content?.trim();
        if (!suggestion) throw new Error("La réponse est vide.");
        return suggestion;

    } catch (error) {
        console.error("Erreur IA:", error);
        updateStatus(`Erreur IA: ${error.message}`, true);
        return null;
    }
}

// --- Rendu ---
function createCommentButton(elementId) {
    const btn = document.createElement('button');
    btn.classList.add('comment-btn');
    btn.title = "Ajouter commentaire";
    btn.dataset.targetId = elementId;
    btn.addEventListener('click', handleAddCommentClick);
    btn.innerHTML = '💬'; // Icône emoji
    return btn;
}

function createAISuggestButton(elementId) {
    const btn = document.createElement('button');
    btn.classList.add('ai-suggest-btn');
    btn.title = "Demander amélioration";
    btn.dataset.targetId = elementId;
    btn.addEventListener('click', handleAISuggestClick);
    btn.innerHTML = '🤖';
    return btn;
}

function renderComments(containerElement, itemData) {
    let commentSection = containerElement.querySelector('.comments-section');
    if (!commentSection) {
        commentSection = document.createElement('div');
        commentSection.classList.add('comments-section');
        containerElement.appendChild(commentSection);
    }
    commentSection.style.display = commentsVisible ? 'block' : 'none';

    if (itemData.comments && itemData.comments.length > 0) {
        commentSection.innerHTML = '';
        itemData.comments.forEach(comment => {
            const commentDiv = document.createElement('div');
            commentDiv.classList.add('comment');
            commentDiv.innerHTML = `
                <div class="comment-header">${comment.author || 'Anonyme'} - ${new Date(comment.timestamp).toLocaleString()}</div>
                <div class="comment-text">${comment.text}</div>
            `;
            commentSection.appendChild(commentDiv);
        });
    }
}

function buildSidebarNav(data) {
    const navList = document.getElementById('sidebar-nav');
    if (!navList) return;

    navList.innerHTML = '';

    function addItem(item, levelClass) {
        const li = document.createElement('li');
        // Ajouter le numéro de clause si disponible (simplifié)
        const clauseNumber = item.title?.match(/^(\d+(\.\d+)*)/)?.[1] || '';
        const displayText = clauseNumber ? `${clauseNumber} - ${item.title}` : item.title || item.text?.substring(0, 30) + '...';
        li.textContent = displayText;
        li.classList.add(levelClass);
        li.dataset.elementId = item.id;
        li.addEventListener('click', () => {
            navList.querySelectorAll('li').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            const targetElement = document.querySelector(`[data-id="${item.id}"]`);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                // Effet visuel temporaire
                targetElement.style.outline = '2px solid #3498db';
                setTimeout(() => { targetElement.style.outline = ''; }, 2000);
            }
        });
        navList.appendChild(li);
    }

    if (data.chapters && Array.isArray(data.chapters)) {
        data.chapters.forEach(chapter => {
            addItem(chapter, 'chapter-item');
            if (chapter.sections && Array.isArray(chapter.sections)) {
                chapter.sections.forEach(section => {
                    addItem(section, 'section-item');
                    // Ajouter les tableaux comme éléments de navigation
                    if (section.content && Array.isArray(section.content)) {
                        section.content.forEach(contentItem => {
                            if (contentItem.type === 'table') {
                                const tableItem = {
                                    id: contentItem.id,
                                    title: contentItem.title || `Tableau (${section.title?.match(/^(\d+(\.\d+)*)/)?.[1] || 'N/A'})`
                                };
                                addItem(tableItem, 'subsection-item'); // ou un style spécifique pour les tables
                            }
                        });
                    }
                });
            }
        });
    }
}


function displayReport_enhanced() {
    if (!reportData || !docInfoElement || !docStructureElement) return;

    docInfoElement.innerHTML = `
        <h2>Informations du Document</h2>
        <p><strong>Nom du fichier:</strong> ${reportData.metadata?.originalFilename || 'N/A'}</p>
        <p><strong>Date de traitement:</strong> ${reportData.metadata?.processingTimestamp ? new Date(reportData.metadata.processingTimestamp).toLocaleString() : 'N/A'}</p>
        <p><strong>Source:</strong> ${reportData.metadata?.source === 'json' ? 'Fichier JSON' : 'Fichier DOCX'}</p>
    `;

    docStructureElement.innerHTML = '';

    function displayContentItems(items, parentElement) {
        if (!Array.isArray(items)) return;
        items.forEach(item => {
            const container = document.createElement('div');
            container.classList.add('report-element');
            container.dataset.id = item.id;

            if (item.type === 'paragraph') {
                const p = document.createElement('p');
                p.contentEditable = "true";
                p.dataset.id = item.id;
                p.textContent = item.text || '';
                p.addEventListener('input', handleContentEdit);

                const btnContainer = document.createElement('div');
                btnContainer.classList.add('btn-container');
                btnContainer.appendChild(createCommentButton(item.id));
                btnContainer.appendChild(createAISuggestButton(item.id));

                container.appendChild(p);
                container.appendChild(btnContainer);
                renderComments(container, item);
            } else if (item.type === 'table') {
                const table = document.createElement('table');
                table.dataset.id = item.id;

                if (item.caption && item.caption.text) {
                    const caption = document.createElement('caption');
                    caption.contentEditable = "true";
                    caption.dataset.id = item.caption.id;
                    caption.textContent = item.caption.text;
                    caption.addEventListener('input', handleContentEdit);
                    table.appendChild(caption);
                }

                item.rows.forEach(rowData => {
                    const tr = table.insertRow();
                    rowData.cells.forEach(cellData => {
                        const td = tr.insertCell();
                        td.contentEditable = "true";
                        td.dataset.id = cellData.id;
                        td.colSpan = cellData.colspan || 1;
                        td.textContent = cellData.text || '';
                        td.addEventListener('input', handleContentEdit);

                        const cellBtnContainer = document.createElement('div');
                        cellBtnContainer.classList.add('btn-container');
                        cellBtnContainer.appendChild(createCommentButton(cellData.id));
                        cellBtnContainer.appendChild(createAISuggestButton(cellData.id));
                        td.appendChild(cellBtnContainer);

                        renderComments(td, cellData);
                    });
                });

                const tableBtnContainer = document.createElement('div');
                tableBtnContainer.classList.add('btn-container');
                tableBtnContainer.appendChild(createCommentButton(item.id));
                tableBtnContainer.appendChild(createAISuggestButton(item.id));

                container.appendChild(table);
                container.appendChild(tableBtnContainer);
                renderComments(container, item);
            }

            parentElement.appendChild(container);
        });
    }

    function displayStructure(items, parentElement) {
        if (!Array.isArray(items)) return;
        items.forEach(item => {
            const container = document.createElement('div');
            container.classList.add('report-element');
            container.dataset.id = item.id;

            let titleElement;
            if (item.level === 1) titleElement = document.createElement('h2');
            else if (item.level === 2) titleElement = document.createElement('h3');
            else if (item.level === 3) titleElement = document.createElement('h4');
            else titleElement = document.createElement('h5');

            titleElement.contentEditable = "true";
            titleElement.dataset.id = item.id;
            titleElement.textContent = item.title || 'Titre sans nom';
            titleElement.addEventListener('input', handleContentEdit);

            const titleBtnContainer = document.createElement('div');
            titleBtnContainer.classList.add('btn-container');
            titleBtnContainer.appendChild(createCommentButton(item.id));
            titleBtnContainer.appendChild(createAISuggestButton(item.id));

            container.appendChild(titleElement);
            container.appendChild(titleBtnContainer);
            renderComments(container, item);

            if (item.content && Array.isArray(item.content)) {
                displayContentItems(item.content, container);
            }

            if (item.subsections && Array.isArray(item.subsections)) {
                displayStructure(item.subsections, container);
            }

            if (item.sections && Array.isArray(item.sections)) {
                displayStructure(item.sections, container);
            }

            parentElement.appendChild(container);
        });
    }

    if (reportData.chapters && Array.isArray(reportData.chapters)) {
        displayStructure(reportData.chapters, docStructureElement);
    }

    buildSidebarNav(reportData);
}

// --- Gestion des événements ---
function handleContentEdit(event) {
    const targetElement = event.target;
    const elementId = targetElement.dataset.id || targetElement.closest('[data-id]')?.dataset.id;
    if (!elementId) return;
    const dataObject = findElementById(elementId);
    if (dataObject) {
        const newText = targetElement.innerText.trim();
        if (dataObject.hasOwnProperty('text')) {
            dataObject.text = newText;
        } else if (dataObject.hasOwnProperty('title') && (targetElement.nodeName.startsWith('H') || targetElement.nodeName === 'CAPTION')) {
            dataObject.title = newText;
            // Mettre à jour le menu latéral si le titre change
            const navItem = document.querySelector(`#sidebar-nav li[data-element-id="${elementId}"]`);
            if (navItem) {
                 const clauseNumber = newText?.match(/^(\d+(\.\d+)*)/)?.[1] || '';
                 const displayText = clauseNumber ? `${clauseNumber} - ${newText}` : newText || 'Titre sans nom';
                 navItem.textContent = displayText.substring(0, 50) + (displayText.length > 50 ? '...' : '');
            }
        }
    }
}

function handleAddCommentClick(event) {
    const targetId = event.currentTarget.dataset.targetId;
    const commentText = prompt(`Ajouter un commentaire pour l'élément (ID: ${targetId}):`);
    if (commentText && commentText.trim()) {
        addComment(targetId, commentText.trim());
    }
}

function addComment(targetId, text) {
    const targetElementData = findElementById(targetId);
    if (targetElementData) {
        if (!targetElementData.comments) targetElementData.comments = [];
        const newComment = {
            id: generateId(),
            text: text,
            author: "Utilisateur",
            timestamp: new Date().toISOString()
        };
        targetElementData.comments.push(newComment);
        displayReport_enhanced(); // Re-rendre pour afficher le commentaire
        updateStatus(`Commentaire ajouté.`);
        if (!commentsVisible) handleToggleComments();
    }
}

async function handleAISuggestClick(event) {
    const targetId = event.currentTarget.dataset.targetId;
    const dataObject = findElementById(targetId);

    if (!dataObject || !dataObject.text) {
        alert("Impossible de trouver le texte.");
        return;
    }

    const context = {};
    // Trouver le contexte (chapitre/section parent)
    if (reportData && reportData.chapters) {
        outerLoop: for(const chapter of reportData.chapters) {
            if(chapter.id === targetId) {
                 context.chapterTitle = chapter.title;
                 break;
             }
            if(chapter.content && chapter.content.some(c => c.id === targetId)) {
                context.chapterTitle = chapter.title;
                break;
            }
            if(chapter.sections) {
                for(const section of chapter.sections) {
                    if(section.id === targetId) {
                        context.chapterTitle = chapter.title;
                        context.sectionTitle = section.title;
                        break outerLoop;
                    }
                    if(section.content && section.content.some(c => c.id === targetId)) {
                        context.chapterTitle = chapter.title;
                        context.sectionTitle = section.title;
                        break outerLoop;
                    }
                    if(section.subsections) {
                        for(const subsection of section.subsections) {
                            if(subsection.id === targetId || (subsection.content && subsection.content.some(c => c.id === targetId))) {
                                context.chapterTitle = chapter.title;
                                context.sectionTitle = section.title;
                                break outerLoop;
                            }
                        }
                    }
                }
            }
        }
    }
    context.elementType = dataObject.type || 'inconnu';

    showLoading("Demande de suggestion...");
    const suggestion = await fetchAISuggestion(dataObject.text, context);
    hideLoading();

    if (suggestion) {
        const modal = document.getElementById('ai-modal');
        const originalTextEl = document.getElementById('original-text');
        const suggestedTextEl = document.getElementById('suggested-text');
        const acceptBtn = document.getElementById('accept-suggestion');
        const rejectBtn = document.getElementById('reject-suggestion');
        const cancelBtn = document.getElementById('cancel-suggestion');
        const expandBtn = document.getElementById('expand-suggestion');

        if (!modal || !originalTextEl || !suggestedTextEl || !acceptBtn || !rejectBtn || !cancelBtn || !expandBtn) {
             console.error("Éléments du popup IA manquants dans le DOM.");
             updateStatus("Erreur UI: popup IA incomplet.", true);
             return;
        }

        originalTextEl.textContent = dataObject.text;
        suggestedTextEl.textContent = suggestion; // Utiliser textContent pour <pre>

        function closeModal() {
            modal.style.display = 'none';
        }

        function onAccept() {
            const targetElement = document.querySelector(`[data-id="${targetId}"]`);
            if (targetElement) {
                targetElement.textContent = suggestedTextEl.textContent; // Utiliser textContent
                const inputEvent = new Event('input', { bubbles: true });
                targetElement.dispatchEvent(inputEvent);
                updateStatus("Suggestion acceptée.");
            }
            closeModal();
        }

        function onReject() {
            updateStatus("Suggestion refusée.");
            closeModal();
        }

        function onCancel() {
            closeModal();
        }

        function onExpand() {
            suggestedTextEl.parentElement.style.maxHeight = 'none';
            expandBtn.style.display = 'none';
        }

        // Nettoyer les écouteurs précédents pour éviter les doublons
        acceptBtn.replaceWith(acceptBtn.cloneNode(true));
        rejectBtn.replaceWith(rejectBtn.cloneNode(true));
        cancelBtn.replaceWith(cancelBtn.cloneNode(true));
        expandBtn.replaceWith(expandBtn.cloneNode(true));

        // Ajouter les nouveaux écouteurs
        document.getElementById('accept-suggestion').addEventListener('click', onAccept);
        document.getElementById('reject-suggestion').addEventListener('click', onReject);
        document.getElementById('cancel-suggestion').addEventListener('click', onCancel);
        document.getElementById('expand-suggestion').addEventListener('click', onExpand);

        modal.style.display = 'flex';
    }
}


function handleToggleComments() {
    commentsVisible = !commentsVisible;
    if (toggleCommentsBtn) {
        toggleCommentsBtn.textContent = commentsVisible ? 'Masquer Commentaires' : 'Afficher Commentaires';
    }
    displayReport_enhanced(); // Re-rendre pour appliquer la visibilité
}

function handleSaveJson() {
    if (!reportData) {
        updateStatus("Aucune donnée à sauvegarder.", true);
        return;
    }
    try {
        reportData.metadata.lastId = idCounter;
        reportData.metadata.commentsVisible = commentsVisible;
        reportData.metadata.savedTimestamp = new Date().toISOString();

        const jsonString = JSON.stringify(reportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = (reportData.metadata.originalFilename || 'report').replace(/\.(docx|json)$/i, '') + '_edited.json';
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        updateStatus(`Sauvegardé: ${filename}.`);
    } catch (error) {
        updateStatus(`Erreur: ${error.message}`, true);
    }
}

function loadJsonData(jsonString, sourceFilename = 'données JSON') {
    try {
        clearReportDisplay();
        const parsedData = JSON.parse(jsonString);
        if (typeof parsedData !== 'object' || parsedData === null || (!parsedData.chapters && !parsedData.metadata)) {
            throw new Error("Structure invalide.");
        }
        reportData = parsedData;
        idCounter = reportData.metadata?.lastId || (findMaxId(reportData) + 1) || 0;
        commentsVisible = reportData.metadata?.commentsVisible || false;
        reportData.metadata.source = 'json';
        reportData.metadata.originalFilename = sourceFilename;
        displayReport_enhanced();
        updateStatus(`Chargé depuis ${sourceFilename}.`);
    } catch (error) {
        updateStatus(`Erreur JSON: ${error.message}`, true);
        clearReportDisplay();
    } finally {
        hideLoading();
    }
}

async function handleDocxFileSelect(event) {
    const file = event.target.files[0];
    if (file && file.name.toLowerCase().endsWith('.docx')) {
        showLoading(`Chargement de ${file.name}...`);
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const zip = new JSZip();
                const content = await zip.loadAsync(e.target.result);
                const xmlString = await content.files['word/document.xml'].async('string');
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlString, 'application/xml');
                const parserError = xmlDoc.getElementsByTagName("parsererror");
                if (parserError.length > 0) throw new Error("Erreur XML.");

                clearReportDisplay();
                reportData = {
                    metadata: {
                        originalFilename: file.name,
                        source: 'docx',
                        processingTimestamp: new Date().toISOString(),
                        info: {}
                    },
                    chapters: []
                };

                let currentChapter = null;
                let currentSection = null;
                let currentSubsection = null;
                let pendingContentBeforeFirstChapter = [];

                const body = xmlDoc.getElementsByTagName('w:document')[0]?.getElementsByTagName('w:body')[0];
                if (!body) throw new Error("Balise w:body non trouvée");

                function getParagraphText(element) {
                    const textNodes = element.getElementsByTagName('w:t');
                    let text = '';
                    for (let i = 0; i < textNodes.length; i++) {
                        text += textNodes[i].textContent || '';
                    }
                    return text;
                }

                function getParagraphStyle(element) {
                    const pPr = element.getElementsByTagName('w:pPr')[0];
                    if (pPr) {
                        const styleNode = pPr.getElementsByTagName('w:pStyle')[0];
                        if (styleNode) {
                            const val = styleNode.getAttribute('w:val');
                            if (val) return val;
                        }
                    }
                    return 'Normal';
                }

                function _extractSingleTableData(tblElement) {
                    const tableData = {
                        id: generateId(),
                        type: 'table',
                        rows: [],
                        caption: null,
                        comments: []
                    };

                    const tblChildren = Array.from(tblElement.children);
                    tblChildren.forEach(child => {
                        const childName = child.nodeName;
                        if (childName === 'w:tblPr') { }
                        else if (childName === 'w:tblGrid') { }
                        else if (childName === 'w:tr') {
                            const rowData = { id: generateId(), cells: [] };
                            const cells = Array.from(child.getElementsByTagName('w:tc'));
                            cells.forEach(cell => {
                                const cellData = {
                                    id: generateId(),
                                    text: getParagraphText(cell),
                                    comments: [],
                                    colspan: 1,
                                    vMerge: null
                                };
                                const tcPr = cell.getElementsByTagName('w:tcPr')[0];
                                if (tcPr) {
                                    const vMergeEl = tcPr.getElementsByTagName('w:vMerge')[0];
                                    if (vMergeEl) {
                                        const val = vMergeEl.getAttribute('w:val');
                                        cellData.vMerge = val || 'continue';
                                    }
                                    const gridSpanEl = tcPr.getElementsByTagName('w:gridSpan')[0];
                                    if (gridSpanEl) {
                                        const val = parseInt(gridSpanEl.getAttribute('w:val'), 10);
                                        if (!isNaN(val) && val > 1) {
                                            cellData.colspan = val;
                                        }
                                    }
                                }
                                rowData.cells.push(cellData);
                            });
                            tableData.rows.push(rowData);
                        }
                    });
                    return tableData;
                }

                Array.from(body.children).forEach((element, index) => {
                    const elementName = element.nodeName;
                    if (elementName === 'w:p') {
                        const paraText = getParagraphText(element);
                        const style = getParagraphStyle(element);
                        const levelMatch = style.match(/^Titre(\d+)$/i);
                        const level = levelMatch ? parseInt(levelMatch[1], 10) : null;

                        if (level === 1) {
                            if (pendingContentBeforeFirstChapter.length > 0 && !currentChapter) {
                                const introChapter = {
                                    id: generateId(),
                                    title: "Contenu Initial",
                                    level: 1,
                                    style: "Titre1",
                                    content: pendingContentBeforeFirstChapter,
                                    sections: [],
                                    comments: []
                                };
                                reportData.chapters.unshift(introChapter);
                                pendingContentBeforeFirstChapter = [];
                            }
                            currentChapter = {
                                id: generateId(),
                                title: paraText,
                                level: 1,
                                style: style,
                                content: [],
                                sections: [],
                                comments: []
                            };
                            reportData.chapters.push(currentChapter);
                            currentSection = null;
                            currentSubsection = null;
                        } else if (level === 2 && currentChapter) {
                            currentSection = {
                                id: generateId(),
                                title: paraText,
                                level: 2,
                                style: style,
                                content: [],
                                subsections: [],
                                comments: []
                            };
                            currentChapter.sections.push(currentSection);
                            currentSubsection = null;
                        } else if (level === 3 && currentSection) {
                            currentSubsection = {
                                id: generateId(),
                                title: paraText,
                                level: 3,
                                style: style,
                                content: [],
                                comments: []
                            };
                            currentSection.subsections.push(currentSubsection);
                        } else {
                            const paragraphData = {
                                id: generateId(),
                                type: 'paragraph',
                                text: paraText,
                                style: style,
                                comments: []
                            };
                            if (currentSubsection) {
                                currentSubsection.content.push(paragraphData);
                            } else if (currentSection) {
                                currentSection.content.push(paragraphData);
                            } else if (currentChapter) {
                                currentChapter.content.push(paragraphData);
                            } else {
                                pendingContentBeforeFirstChapter.push(paragraphData);
                            }
                        }
                    } else if (elementName === 'w:tbl') {
                        const tableData = _extractSingleTableData(element);
                        if (tableData) {
                            if (currentSubsection) {
                                currentSubsection.content.push(tableData);
                            } else if (currentSection) {
                                currentSection.content.push(tableData);
                            } else if (currentChapter) {
                                currentChapter.content.push(tableData);
                            } else {
                                pendingContentBeforeFirstChapter.push(tableData);
                            }
                        }
                    }
                });

                if (pendingContentBeforeFirstChapter.length > 0 && reportData.chapters.length > 0) {
                    reportData.chapters[0].content.unshift(...pendingContentBeforeFirstChapter);
                } else if (pendingContentBeforeFirstChapter.length > 0 && reportData.chapters.length === 0) {
                    const introChapter = {
                        id: generateId(),
                        title: "Document",
                        level: 1,
                        style: "Titre1",
                        content: pendingContentBeforeFirstChapter,
                        sections: [],
                        comments: []
                    };
                    reportData.chapters.push(introChapter);
                }

                displayReport_enhanced();
            } catch (error) {
                console.error("Erreur DOCX:", error);
                updateStatus(`Erreur traitement DOCX: ${error.message}`, true);
                clearReportDisplay();
            } finally {
                hideLoading();
            }
        };
        reader.onerror = (e) => {
            console.error("Erreur lecture DOCX:", e.target.error);
            updateStatus(`Erreur de lecture: ${e.target.error?.message}`, true);
            hideLoading();
        };
        reader.readAsArrayBuffer(file);
    } else {
        updateStatus("Format invalide.", true);
        event.target.value = null;
    }
}

function handleJsonFileSelect(event) {
    const file = event.target.files[0];
    if (file && file.name.toLowerCase().endsWith('.json')) {
        showLoading(`Chargement de ${file.name}...`);
        const reader = new FileReader();
        reader.onload = (e) => {
            loadJsonData(e.target.result, file.name);
        };
        reader.onerror = (e) => {
            updateStatus(`Erreur lecture JSON: ${e.target.error?.message}`, true);
            hideLoading();
        };
        reader.readAsText(file);
    } else {
        updateStatus("Format invalide.", true);
        event.target.value = null;
    }
}

// --- Initialisation ---
async function initializeApp() {
    console.log("Initialisation de l'application...");
    // Récupérer les éléments DOM
    docxInput = document.getElementById('docx-input');
    jsonInput = document.getElementById('json-input');
    loadDocxBtn = document.getElementById('load-docx-btn');
    loadJsonBtn = document.getElementById('load-json-btn');
    saveJsonBtn = document.getElementById('save-json-btn');
    toggleCommentsBtn = document.getElementById('toggle-comments-btn');
    statusElement = document.getElementById('status');
    loadingElement = document.getElementById('loading-indicator');
    loadingMessageElement = document.getElementById('loading-message');
    outputContainer = document.getElementById('report-output');
    docInfoElement = document.getElementById('document-info');
    docStructureElement = document.getElementById('document-structure');
    sidebarNav = document.getElementById('sidebar-nav');
    apiKeyInput = document.getElementById('api-key-input');
    setApiKeyBtn = document.getElementById('set-api-key-btn');

    // Vérifier que tous les éléments sont présents
    const requiredElements = [
        docxInput, jsonInput, loadDocxBtn, loadJsonBtn, saveJsonBtn, toggleCommentsBtn,
        statusElement, loadingElement, loadingMessageElement, outputContainer,
        docInfoElement, docStructureElement, sidebarNav, apiKeyInput, setApiKeyBtn
    ];
    if (requiredElements.includes(null) || requiredElements.includes(undefined)) {
        const errorMsg = "Erreur Critique: Impossible de trouver tous les éléments HTML nécessaires. Vérifiez les IDs dans le HTML et le JS.";
        console.error(errorMsg);
        alert(errorMsg);
        if (statusElement) updateStatus("ERREUR D'INITIALISATION", true);
        return;
    }

    if (groqApiKey) {
        apiKeyInput.value = '••••••••••••••••';
        updateStatus("Clé API chargée.");
    }

    // Charger le modèle JSON local
    try {
        showLoading("Chargement du modèle...");
        const response = await fetch('F908-food-audit-report-template _ Micron2_ 31st Oct 2024_edited.json');
        if (response.ok) {
            templateModelData = await response.json();
            console.log("Modèle JSON chargé avec succès.");
            updateStatus("Modèle chargé. Prêt.");
        } else {
             throw new Error(`Erreur HTTP ${response.status}`);
        }
    } catch (error) {
        console.warn("Modèle JSON non trouvé ou erreur:", error);
        updateStatus(`Erreur chargement modèle: ${error.message}. L'IA pourrait être moins précise.`, true);
    } finally {
         hideLoading(); // Masquer le loading une fois le modèle traité
    }


    // Attacher les écouteurs d'événements
    loadDocxBtn.addEventListener('click', () => docxInput.click());
    loadJsonBtn.addEventListener('click', () => jsonInput.click());
    saveJsonBtn.addEventListener('click', handleSaveJson);
    toggleCommentsBtn.addEventListener('click', handleToggleComments);
    docxInput.addEventListener('change', handleDocxFileSelect);
    jsonInput.addEventListener('change', handleJsonFileSelect);

    setApiKeyBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (key) {
            groqApiKey = key;
            sessionStorage.setItem('groqApiKey', key);
            apiKeyInput.value = '••••••••••••••••';
            updateStatus("Clé API définie.");
        } else {
            groqApiKey = '';
            sessionStorage.removeItem('groqApiKey');
            apiKeyInput.placeholder = "Entrez votre clé API Groq";
            updateStatus("Clé API effacée.");
        }
    });

    saveJsonBtn.disabled = true;
    toggleCommentsBtn.disabled = true;
    console.log("Application initialisée.");
}

// --- Démarrage de l'application lorsque le DOM est prêt ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM chargé. Démarrage de l'initialisation.");
    initializeApp();
});

})(); // Fin de l'IIFE