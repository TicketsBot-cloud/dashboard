<div class="discord-media-gallery">
    {#if items && items.length > 0}
        {#each items as item}
            <div class="media-item {item.spoiler ? 'spoiler' : ''}">
                {#if item.media && item.media.url}
                    <img src={item.media.url} alt="Media" />
                {/if}
            </div>
        {/each}
    {/if}
</div>

<script>
    export let items = [];
    // Media modal handling
    const modal = document.getElementById('media-modal');
    const modalImg = document.getElementById('modal-img');
    const modalClose = document.querySelector('.media-modal-close');

    // Open modal on media item click
    document.addEventListener('click', (e) => {
        const mediaItem = e.target.closest('.media-item');
        if (mediaItem) {
            const img = mediaItem.querySelector('img');
            if (img) {
                modal.style.display = 'block';
                modalImg.src = img.src;
            }
        }
    });
    // Close on close button click
    modalClose.addEventListener('click', () => {
        modal.style.display = 'none';
        modalImg.src = '';
    });
    // Close when clicking outside the image
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
            modalImg.src = '';
        }
    });
</script>
<style>
    
/* Media Gallery (Type 12) */
.discord-media-gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 8px;
    margin: 8px 0;
    max-width: 100%;
}

.discord-media-gallery .media-item {
    position: relative;
    overflow: hidden;
    border-radius: 4px;
    height: 100px;
    cursor: pointer;
}

.discord-media-gallery .media-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s ease;
}

/* Zoom on hover */
.discord-media-gallery .media-item:hover img {
    transform: scale(1.1);
}

/* Click (active) zoom effect */
.discord-media-gallery .media-item:active img {
    transform: scale(2);
    transition: transform 0.1s ease;
}
</style>